/**
 * Implements a relatively simple chess engine for infinite chess.
 * This engine incorporates common techniques found in traditional chess bots,
 * adapted to function within the unique constraints of an infinite chessboard.
 * 
 * @author FirePlank
 */

// @ts-ignore
import type { gamefile } from '../../../chess/logic/gamefile.js';
import type { Move, MoveDraft } from '../../../../chess/logic/movepiece.js';
import typeutil, { rawTypes } from '../../../../chess/util/typeutil.js';
import boardutil from '../../../../chess/util/boardutil.js';
import movepiece from '../../../../chess/logic/movepiece.js';
import gameformulator from '../../gameformulator.js';
import evaluation, { PIECE_VALUES } from './evaluation.js';
import helpers from './helpers.js';
import { TranspositionTable, TTFlag } from './tt.js';
import type { Coords } from '../../../../chess/util/coordutil.js';

export const MAX_PLY = 64;
const SEARCH_TIMEOUT_MS = 10000;
const INFINITY = 32000;
const MATE_VALUE = INFINITY - 150;
export const MATE_SCORE = INFINITY - 300;
export const NO_ENTRY = INFINITY - 500;
const TIME_UP = INFINITY + 500;

const NMP_R = 3;
const LMR_MIN_DEPTH = 3;
const LMR_REDUCTION = 1;
let startTime = performance.now();

let STOP = false;

const transpositionTable = new TranspositionTable(32); // in MB
let ttHits = 0;
let killer_moves: Array<Array<MoveDraft | null>> = Array(MAX_PLY).fill(null).map(() => [null, null]);
let history_heuristic_table: Map<string, number> = new Map();

// Counter-move table - track which moves are best in response to specific opponent moves
let counter_moves: Map<string, Move | null> = new Map();

// Continuation history table - track effectiveness of moves after specific move sequences
// We'll use a simplified version tracking [piece][to-square][previous-move-to-square]
type ContinuationHistoryTable = Map<string, Map<string, number>>;
let continuation_history: ContinuationHistoryTable = new Map();

// For countermoves, we need a way to generate a unique key
function generateMoveKey(move: Move): string {
	const pieceType = move.type || 0; // Fallback to 0 if undefined
	return `${pieceType}_${move.startCoords[0]},${move.startCoords[1]}_${move.endCoords[0]},${move.endCoords[1]}`;
}

// For continuation history, we need piece+square keys
function generatePieceSquareKey(pieceType: number, square: Coords): string {
	return `${pieceType}_${square[0]},${square[1]}`;
}

let pv_table: (MoveDraft | null | undefined)[][] = Array(MAX_PLY).fill(null).map(() => [null, null]);
let pv_length: number[] = Array(MAX_PLY).fill(0);

// History score normalization constants
const HISTORY_MAX = 16384;
const HISTORY_DIVISOR = 8192;

export interface SearchData {
  nodes: number;
  ply: number;
  bestMove: MoveDraft | null;
  startDepth: number;
  score_pv: boolean;
  follow_pv: boolean;
  previousMove?: Move | null; // Track previous move for continuation history
}

/**
 * Indicates that the web worker is ready. Sent immediately after the worker's script
 * has finished loading and the worker is ready to accept calculation requests.
 */
postMessage("readyok");

// --- Message Handling ---
self.onmessage = function(e: MessageEvent) {
	const data = e.data;

	// --- Input Validation ---
	if (!data || typeof data !== 'object') {
		console.error("[Engine] Invalid message received (not an object):", data);
		return;
	}

	// --- Update State (Formulate Gamefile) ---
	// Use gameformulator to construct the gamefile
	const current_gamefile = gameformulator.formulateGame(data.lf);

	if (!current_gamefile) {
		console.error("[Engine] Failed to formulate gamefile from data.lf");
		return;
	}

	// --- Update Player Assignment ---
	const weAre = current_gamefile.whosTurn;

	// --- Start Calculation ---
	console.debug(`[Engine] Calculating move for ${weAre === 1 ? 'white' : 'black'}`);
	ttHits = 0; // Reset TT hits counter

	const searchData: SearchData = { nodes: 0, bestMove: null, startDepth: 0, ply: 0, score_pv: false, follow_pv: true };
	const start = performance.now();
	findBestMove(current_gamefile, searchData);
	const duration = (performance.now() - start).toFixed(2);
	console.debug(`[Engine] Calculation took ${duration} ms. TT Hits: ${ttHits}`);

	// --- Post Result ---
	const move = searchData.bestMove;
	console.debug(`[Engine] Found best move: (${move?.startCoords}) to (${move?.endCoords})`);
	postMessage(move);
};

/**
 * The main search function using Negamax with alpha-beta pruning and PVS.
 * @param lf The current logical gamefile state.
 * @param depth The current search depth.
 * @param alpha The alpha value for pruning.
 * @param beta The beta value for pruning.
 * @param data Object to store search data (nodes, best move).
 * @param null_move Whether to perform null move pruning.
 * @returns The evaluation score for the current position.
 */
function negamax(lf: gamefile, depth: number, alpha: number, beta: number, data: SearchData, null_move: boolean): number {
	data.nodes++;
	let best_move: MoveDraft | null = null;
	let score: number;
	const pv_node = beta - alpha > 1;
	let hash_flag = TTFlag.LOWER_BOUND;
	const is_root = data.ply === 0;

	if (data.ply >= MAX_PLY) {
		return evaluation.evaluate(lf);
	}

	// TODO: check for fifty-move rule

	// Initialize PV length for this ply
	pv_length[data.ply] = data.ply;

	if (!is_root) {
		// TODO: threefold check

		// mate distance pruning
		if (alpha < -MATE_VALUE) {
			alpha = -MATE_VALUE;
		} if (beta > MATE_VALUE - 1) {
			beta = MATE_VALUE - 1;
		} if (alpha >= beta) {
			return alpha;
		}
	}
	
	// --- Base Case: Depth Reached or Terminal Node ---
	if (depth <= 0) {
		return quiescenceSearch(lf, alpha, beta, data);
	}

	const opponent = typeutil.invertPlayer(lf.whosTurn);
	const isInCheck = lf.inCheck;

	if (isInCheck) {
		depth++;
	}

	const hash = TranspositionTable.generateHash(lf);

	// --- Transposition Table Probe ---
	if (!is_root && !pv_node) {
		const result = transpositionTable.probe(hash, alpha, beta, depth, data.ply);
		if (typeof result === 'number') {
			if (result !== NO_ENTRY) {
				ttHits++;
				return result;
			}
			score = result;
		} else {
			best_move = result;
		}
	}

	// every 2047 nodes
	if (data.nodes % 2047 === 0 && stop_search()) {
		return 0;
	}

	// static evaluation
	const evalScore = evaluation.evaluate(lf);

	if (!isInCheck && !pv_node) {
		// reverse futility pruning - improved with deeper margin estimates
		// Don't prune if beta is near mate scores to avoid missing forced mates
		if (depth < 3 && Math.abs(beta) < MATE_SCORE) {
			// Calculate margin based on depth with a logarithmic scaling factor
			// for better estimation of position complexity
			const margin = 120 * depth * (1 + Math.log(Math.max(1, depth)));
			if (evalScore - margin >= beta) {
				// Return a more accurate score - avoid returning scores above beta
				return Math.min(evalScore, beta);
			}
		}

		// Enchanced futility pruning
		if (depth < 3 && Math.abs(alpha) < MATE_SCORE) {
			const margin = 120 * depth * (1 + Math.log(Math.max(1, depth)));
			if (evalScore + margin <= alpha) {
				// do quisence to avoid horizon effect
				const qScore = quiescenceSearch(lf, alpha, beta, data);
				if (qScore <= alpha) {
					return qScore;
				}
			}
		}


		// --- Null Move Pruning (NMP) with Verification ---
		if (null_move) {
			// Simple heuristic: Assume not zugzwang if player has pieces other than pawns/king
			const has_major_or_minor_pieces = boardutil.getPieceCountOfGame(lf.pieces, {
				ignoreColors: new Set([opponent]),
				ignoreRawTypes: new Set([rawTypes.PAWN, rawTypes.KING])
			}) > 0;

			if (has_major_or_minor_pieces) {
				data.ply += 1;
				// Dynamic NMP reduction - deeper reduction for deeper searches
				const R = NMP_R + Math.min(3, Math.floor(depth / 3));
				
				// Make a null move
				const nullMove = movepiece.generateNullMove(lf);
				movepiece.makeMove(lf, nullMove);
				const nullScore = -negamax(lf, depth - 1 - R, -beta, -beta + 1, data, false);
				// Undo null move
				movepiece.rewindMove(lf);
				data.ply -= 1;

				// return if time is up
				if (STOP) {
					return NO_ENTRY;
				}

				if (nullScore >= beta) {
					// Verification search for potential zugzwang positions
					// Only do verification if we're at a sufficiently deep search
					// if (depth >= 5 && Math.abs(nullScore) < MATE_SCORE) {
					// 	// Reduced depth verification
					// 	const verificationScore = negamax(lf, depth - R, alpha, beta, data, false);
					// 	if (verificationScore >= beta) {
					// 		return beta;
					// 	}
					// } else {
					return beta; // Skip verification for shallow depths or mate scores
					// }
				}
			}
		}
		// // --- Enhanced Razoring (Static Futility Pruning) ---
		// if (depth <= 3) {
		// 	// More aggressive margin for better pruning
		// 	const razorMargin = evalScore + 125 * depth;
		// 	if (razorMargin < beta) {
		// 		if (depth === 1) {
		// 			// Direct quiescence search for depth 1
		// 			const qscore = quiescenceSearch(lf, alpha, beta, data);
		// 			if (qscore < beta) {
		// 				return Math.max(razorMargin, qscore);
		// 			}
		// 		} else {
		// 			// For higher depths, try a shallow search first
		// 			const new_score = negamax(lf, 1, alpha, beta, data, false);
		// 			if (new_score < beta) {
		// 				// If the shallow search fails low, confirm with quiescence
		// 				const qscore = quiescenceSearch(lf, alpha, beta, data);
		// 				return Math.max(razorMargin, qscore);
		// 			}
		// 		}
		// 	}
		// }
	}

	// Enhanced futility pruning margin with depth scaling
	const fp_margin = evalScore + 90 * depth * (1 + Math.log(Math.max(1, depth)));

	// Timeout check
	if (stop_search()) {
		return TIME_UP;
	}


	// --- Generate and Order Moves ---
	const legalMoves = helpers.generateLegalMoves(lf, lf.whosTurn);

	// Check for terminal nodes (checkmate/stalemate)
	if (legalMoves.length === 0) {
		if (isInCheck) {
			return -MATE_VALUE + data.ply; // Checkmate
		} else {
			return 0; // Stalemate
		}
	}

	if (data.follow_pv) {
		helpers.enable_pv_scoring(legalMoves, pv_table, data);
	}

	// --- Move Ordering ---
	legalMoves.sort((a, b) =>
		evaluation.scoreMove(b, lf, data, pv_table, killer_moves, history_heuristic_table, best_move, counter_moves, continuation_history) -
    evaluation.scoreMove(a, lf, data, pv_table, killer_moves, history_heuristic_table, best_move, counter_moves, continuation_history)
	);

	let bestScore = -INFINITY;
	let skip_quiet = false;
	let moves_searched = 0;

	// --- Search Loop (PVS) ---
	for (let i = 0; i < legalMoves.length; i++) {
		const currentMoveDraft = legalMoves[i]!;
		const fullMove = movepiece.generateMove(lf, currentMoveDraft); // Generate full move first

		if (!fullMove) {
			console.error("[Engine] Failed to generate full move for draft:", currentMoveDraft);
			continue; // Skip invalid move generation
		}

		const is_quiet = !fullMove.flags.capture;
		if (is_quiet && skip_quiet) {
			continue;
		}

		const is_killer = helpers.movesAreEqual(killer_moves[0]![data.ply], currentMoveDraft) || helpers.movesAreEqual(killer_moves[1]![data.ply], currentMoveDraft);

		if (!is_root && bestScore > -INFINITY) {
			// Enhanced futility pruning for non-root nodes
			if (depth < 8 && is_quiet && !is_killer && fp_margin <= alpha && Math.abs(alpha) < INFINITY - 100) {
				skip_quiet = true;
				continue;
			}
		}

		movepiece.makeMove(lf, fullMove); // Make the move
		data.ply += 1;
		
		// Track previous move for counter-moves and continuation history
		const previousMove = data.previousMove;
		data.previousMove = fullMove;

		// PVS Search		
		// full depth search
		if (moves_searched === 0) {
			score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
		} else {
			// Enhanced Late Move Reduction with dynamic depth adjustment
			let reduction = 0;
			if (moves_searched >= LMR_MIN_DEPTH && 
			    depth >= LMR_REDUCTION && 
			    !isInCheck && 
			    is_quiet && 
			    !fullMove.promotion) {
				// Base reduction factor
				reduction = 1 + Math.floor(Math.log(moves_searched) * Math.log(depth) / 3);
				
				// Reduce reduction if this is a killer move or has good history
				if (is_killer) reduction = Math.max(0, reduction - 1);
				
				// Never reduce below 1 and cap at depth-2
				reduction = Math.min(depth - 2, Math.max(1, reduction));
				
				// Perform reduced depth search with zero window
				score = -negamax(lf, depth - reduction - 1, -alpha - 1, -alpha, data, true);
			} else {
				score = alpha + 1; // Force a full search
			}

			// If the reduced search exceeded alpha, do a normal search
			if (score > alpha) {
				// Null window search first
				score = -negamax(lf, depth - 1, -alpha - 1, -alpha, data, true);
				// If good move found but didn't exceed beta, do a full-window search
				if (score > alpha && score < beta) {
					score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
				}
			}
		}

		// Restore previous move for upper levels
		data.previousMove = previousMove;
		movepiece.rewindMove(lf);
		data.ply--;

		if (stop_search()) {
			return TIME_UP;
		}

		moves_searched++;

		if (score > bestScore) {
			bestScore = score;
		}

		// Alpha-Beta Pruning
		if (score > alpha) {
			hash_flag = TTFlag.EXACT;
			best_move = currentMoveDraft;
			bestScore = score;
			alpha = score;

			if (is_quiet) {
				updateHistoryScore(lf, fullMove, depth, history_heuristic_table, data);
			}

			// Update PV table - store this move as the first in the PV
			pv_table[data.ply]![data.ply] = currentMoveDraft;

			// Copy moves from deeper ply's PV table to this ply's PV table
			for (let nextPly = data.ply + 1; nextPly < MAX_PLY; nextPly++) {
				if (pv_table[data.ply + 1] && pv_table[data.ply + 1]![nextPly]) {
					pv_table[data.ply]![nextPly] = pv_table[data.ply + 1]![nextPly];
				} else {
					break;
				}
			}

			// Update PV length to include the moves we just copied
			pv_length[data.ply] = pv_length[data.ply + 1]!;

			if (score >= beta) {
				// Store hash entry with the score equal to beta
				transpositionTable.store(hash, depth, TTFlag.UPPER_BOUND, beta, best_move, data.ply);

				if (is_quiet) {
					// Store killer moves
					killer_moves[1]![data.ply] = killer_moves[0]![data.ply]!;
					killer_moves[0]![data.ply] = currentMoveDraft;
				}

				return beta;
			}
		}
	}

	transpositionTable.store(hash, depth, hash_flag, alpha, best_move, data.ply);
	return alpha;
}

/**
 * Quiescence search explores only 'noisy' moves (captures, promotions, checks - currently only captures)
 * to avoid the horizon effect in tactical situations.
 */
function quiescenceSearch(
	lf: gamefile,
	alpha: number,
	beta: number,
	data: SearchData
): number {
	data.nodes++;

	// Get static evaluation
	const evalScore = evaluation.evaluate(lf);

	// Stand-pat: If static evaluation exceeds beta, return beta
	if (evalScore >= beta) {
		return beta;
	} else if (evalScore > alpha) {
		alpha = evalScore;
	}

	if (data.ply >= MAX_PLY) {
		return evalScore;
	}

	// Timeout check
	if (data.nodes % 2047 === 0 && stop_search()) {
		return TIME_UP;
	}

	// Enhanced delta pruning - skip likely useless captures
	const futilityMargin = 150; // Typical value of a pawn + a bit more
	const futilityBase = evalScore + futilityMargin;

	const allMoves = helpers.generateLegalMoves(lf, lf.whosTurn);

	const captureMoves = allMoves.filter(move => {
		const targetPiece = boardutil.getPieceFromCoords(lf.pieces, move.endCoords);
		return targetPiece !== undefined && typeutil.getColorFromType(targetPiece.type) !== lf.whosTurn;
	});

	const scoredCaptures = captureMoves.map(move => {
		// Delta pruning - if the captured piece + margin doesn't improve alpha, it's likely futile
		const targetPiece = boardutil.getPieceFromCoords(lf.pieces, move.endCoords)!;
		const captureValue = PIECE_VALUES[typeutil.getRawType(targetPiece.type)] || 0;
		const isFutile = futilityBase + captureValue < alpha;

		return {
			move: move,
			score: evaluation.scoreMove(move, lf, data, pv_table, killer_moves, history_heuristic_table, null, counter_moves, continuation_history),
			isFutile: isFutile
		};
	}).sort((a, b) => b.score - a.score);

	// --- Explore Noisy Moves ---
	for (const { move, isFutile } of scoredCaptures) {
		// Skip likely futile captures, but not in positions close to the root
		if (isFutile && data.ply > 2) {
			continue;
		}

		const fullMove = movepiece.generateMove(lf, move);
		movepiece.makeMove(lf, fullMove);
		data.ply++;
		
		// Track previous move for counter-moves and continuation history
		const previousMove = data.previousMove;
		data.previousMove = fullMove;
		
		const score = -quiescenceSearch(lf, -beta, -alpha, data);
		
		// Restore previous move state
		data.previousMove = previousMove;
		data.ply--;
		movepiece.rewindMove(lf);

		if (STOP) {
			return TIME_UP;
		}

		if (score > alpha) {
			alpha = score;
			if (score >= beta) {
				return beta;
			}
		}
	}

	return alpha;
}

function stop_search() {
	if (STOP || performance.now() > startTime + SEARCH_TIMEOUT_MS) {
		STOP = true;
		return true;
	}
	return false;
}

/**
 * Update the history score for a move that caused a beta cutoff
 * @param lf Current game state
 * @param move The move that caused the cutoff
 * @param depth Search depth
 * @param history_table The history heuristic table to update
 * @param data Search data containing ply information and previous move
 */
function updateHistoryScore(
	lf: gamefile, 
	move: Move, 
	depth: number, 
	history_table: Map<string, number>,
	data: SearchData
): void {
	const movedPiece = boardutil.getTypeFromCoords(lf.pieces, move.startCoords)!;
	const pieceType = typeutil.getRawType(movedPiece);
	const key = evaluation.getHistoryKey(pieceType, move.endCoords);

	// Use depth-squared bonus instead of linear depth
	const bonus = depth * depth;
	let score = (history_table.get(key) || 0) + bonus;

	// Normalize scores to prevent overflow
	if (score > HISTORY_MAX) {
		// Scale down all history scores
		history_table.forEach((value, key) => {
			history_table.set(key, Math.floor(value / HISTORY_DIVISOR));
		});
		score = Math.floor(score / HISTORY_DIVISOR);
	}

	history_table.set(key, score);

	// Update counter moves table (if we have a previous move)
	if (data.previousMove) {
		const prevMoveKey = generateMoveKey(data.previousMove);
		counter_moves.set(prevMoveKey, move);
	}

	// Update continuation history
	if (data.previousMove) {
		const pieceSquareKey = generatePieceSquareKey(pieceType, move.endCoords);
		const prevSquareKey = generatePieceSquareKey(
            boardutil.getTypeFromCoords(lf.pieces, data.previousMove.startCoords)!, 
            data.previousMove.endCoords
		);

		if (!continuation_history.has(pieceSquareKey)) {
			continuation_history.set(pieceSquareKey, new Map());
		}

		const contTable = continuation_history.get(pieceSquareKey)!;
		const contScore = (contTable.get(prevSquareKey) || 0) + bonus;
		contTable.set(prevSquareKey, Math.min(contScore, HISTORY_MAX));
	}
}

/**
 * Decay all history scores at the start of a new search iteration
 * @param history_table The history heuristic table to decay
 */
function decayHistoryScores(history_table: Map<string, number>): void {
	history_table.forEach((value, key) => {
		history_table.set(key, Math.floor(value * 0.9)); // Decay by 10%
	});

	// Also decay continuation history
	continuation_history.forEach((toSquareMap) => {
		toSquareMap.forEach((value, key) => {
			toSquareMap.set(key, Math.floor(value * 0.9));
		});
	});
}

/**
 * Iterative deepening search driver.
 * Calls negamax for increasing depths until timeout or max depth is reached.
 * @param lf The current game state.
 */
function findBestMove(lf: gamefile, searchData: SearchData) {
	STOP = false;
	startTime = performance.now();

	// Reset search-specific data before starting
	killer_moves = Array(MAX_PLY).fill(null).map(() => [null, null]);
	history_heuristic_table = new Map();
	// Reset counter moves and continuation history but maintain across searches
	if (!counter_moves.size) {
		counter_moves = new Map();
	}
	if (!continuation_history.size) {
		continuation_history = new Map();
	}
	pv_table = Array(MAX_PLY).fill(null).map(() => [null, null]);
	pv_length = Array(MAX_PLY).fill(0);
	
	// Iterative deepening loop with aspiration windows
	let prevScore = 0; // Score from previous iteration
	
	for (let depth = 1; depth <= MAX_PLY; depth++) {
		if (stop_search()) {
			break;
		}

		searchData.follow_pv = true;
		
		// Decay scores at the start of each depth iteration
		decayHistoryScores(history_heuristic_table);
		
		// For depth 1, use full window. For deeper searches, use aspiration windows
		let score;
		if (depth === 1) {
			// First iteration uses full window
			score = negamax(lf, depth, -INFINITY, INFINITY, searchData, true);
		} else {
			// Use aspiration windows for deeper searches
			// Start with a narrow window around the previous score
			const initialWindowSize = 25; // Initial window size (in centipawns)
			let currentAlpha = Math.max(-INFINITY, prevScore - initialWindowSize);
			let currentBeta = Math.min(INFINITY, prevScore + initialWindowSize);
			
			score = negamax(lf, depth, currentAlpha, currentBeta, searchData, true);

			if (stop_search()) {
				break;
			}
			
			// If the score falls outside our window, gradually widen the failing bound
			// Modern engines use exponential widening of the failing bound
			if (score <= currentAlpha || score >= currentBeta) {
				console.debug(`[Engine] Aspiration window failed at depth ${depth}, score: ${score}, window: [${currentAlpha}, ${currentBeta}]`);
				
				// Gradual widening factors - multiply window by these values on consecutive fails
				const wideningFactors = [4, 4, 2, 2, 2, 2]; // Roughly exponential widening
				let currentFactor = 0;
				
				// Re-search with gradually widening windows
				while ((score <= currentAlpha || score >= currentBeta) && currentFactor < wideningFactors.length) {
					// Widen the appropriate bound
					const delta = initialWindowSize * wideningFactors[currentFactor]!;
					
					// eslint-disable-next-line max-depth
					if (score <= currentAlpha) {
						// Failed low - widen the lower bound, keep upper bound unchanged
						currentAlpha = Math.max(-INFINITY, prevScore - delta);
						console.debug(`[Engine] Failed low, widening alpha: [${currentAlpha}, ${currentBeta}]`);
					} else {
						// Failed high - widen the upper bound, keep lower bound unchanged
						currentBeta = Math.min(INFINITY, prevScore + delta);
						console.debug(`[Engine] Failed high, widening beta: [${currentAlpha}, ${currentBeta}]`);
					}
					
					// Re-search with new bounds
					score = negamax(lf, depth, currentAlpha, currentBeta, searchData, true);
					
					if (stop_search()) {
						break;
					}
					
					currentFactor++;
				}
				
				// If we've exhausted our widening factors and still failing, use full window
				if ((score <= currentAlpha || score >= currentBeta) && !stop_search()) {
					console.debug(`[Engine] Aspiration window still failing after all widenings, using full window`);
					score = negamax(lf, depth, -INFINITY, INFINITY, searchData, true);
				}
			}
		}

		if (stop_search()) {
			break;
		}
		
		// Store score for next iteration's window
		prevScore = score;

		let printString = `[Engine] info depth ${depth} nodes ${searchData.nodes}`;
		
		if (score > -MATE_VALUE && score < -MATE_SCORE) {
			printString += ` score mate ${-(pv_length[0]!) / 2 - 1} pv`;
		} else if (score > MATE_SCORE && score < MATE_VALUE) {
			printString += ` score mate ${pv_length[0]! / 2 + 1} pv`;
		} else {
			printString += ` score cp ${Math.round(score)} pv`;
		}
		
		// Display PV moves with validation to prevent nulls
		if (pv_length[0]! > 0) {
			printString += " [";
			for (let i = 0; i < pv_length[0]!; i++) {
				const move = pv_table[0]![i];
				if (move) {
					printString += `(${move.startCoords}) to (${move.endCoords}), `;
				} else {
					break; // Stop at the first null move
				}
			}
			printString = printString.slice(0, -2) + "]";
		}

		console.debug(printString);
		
		// Set bestMove after each iteration - ensures we always have the best move even if time runs out
		if (pv_table[0] && pv_table[0][0]) {
			searchData.bestMove = pv_table[0][0];
		}
	}

	transpositionTable.incrementAge();
}