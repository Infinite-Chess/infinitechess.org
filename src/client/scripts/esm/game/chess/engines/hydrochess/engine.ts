/**
 * Implements a relatively simple chess engine for infinite chess.
 * This engine incorporates common techniques found in traditional chess bots,
 * adapted to function within the unique constraints of an infinite chessboard.
 * 
 * @author FirePlank
 */


import type { FullGame } from '../../../../chess/logic/gamefile.js';
import type { Move, MoveDraft } from '../../../../chess/logic/movepiece.js';
import typeutil, { rawTypes, players, Player } from '../../../../chess/util/typeutil.js';
import boardutil from '../../../../chess/util/boardutil.js';
import movepiece from '../../../../chess/logic/movepiece.js';
import gameformulator from '../../gameformulator.js';
import evaluation, { PIECE_VALUES, EvaluationState } from './evaluation.js';
import helpers from './helpers.js';
import checkdetection from '../../../../chess/logic/checkdetection.js';
import { TranspositionTable, TTFlag } from './tt.js';
import type { Coords } from '../../../../chess/util/coordutil.js';

export const MAX_PLY = 64;
const SEARCH_TIMEOUT_MS = 10000;
const INFINITY = 32000;
const MATE_VALUE = INFINITY - 150;
const ILLEGAL_MOVE = INFINITY - 100;

// Global evaluation state for incremental evaluation
// Initialize the EvaluationState object

/**
 * Gets the coordinates of a king of the specified color from the current board
 * @param gamefile Current game state
 * @param color The color of the king to find
 * @returns Coordinates of the king or undefined if not found
 */
function getKingCoordinates(gamefile: FullGame, color: Player): Coords {
	const kingType = typeutil.buildType(rawTypes.KING, color);
	const pieces = gamefile.boardsim.pieces;
	// There is only 1 king of each color, so we know the start index of the king's type range is where it's at.
	const kingIdx = gamefile.boardsim.pieces.typeRanges.get(kingType)!.start;
	return [
		pieces.XPositions[kingIdx]!,
		pieces.YPositions[kingIdx]!
	];
}
export const evalState = new EvaluationState();

export const MATE_SCORE = INFINITY - 300;
export const NO_ENTRY = INFINITY - 500;
const TIME_UP = INFINITY + 500;

// Null Move Pruning reduction factor - higher means more aggressive pruning
const NMP_R = 3;
const LMR_MIN_DEPTH = 3;
const LMR_REDUCTION = 1;
const WINDOW_SIZE = 10000;
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
let evalHistory: number[] = Array(MAX_PLY).fill(0);

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
  numExtensions: number;
  seldepth?: number;
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
	const weAre = current_gamefile.basegame.whosTurn;

	// --- Start Calculation ---
	console.debug(`[Engine] Calculating move for ${weAre === 1 ? 'white' : 'black'}`);
	// Initialize evaluation state from current position
	evalState.initFromPosition(current_gamefile);
	ttHits = 0; // Reset TT hits counter

	const searchData: SearchData = { nodes: 0, bestMove: null, startDepth: 0, ply: 0, score_pv: false, follow_pv: true, numExtensions: 0};
	const start = performance.now();
	findBestMove(current_gamefile, searchData);
	const duration = (performance.now() - start).toFixed(2);
	console.debug(`[Engine] Calculation took ${duration} ms. TT Hits: ${ttHits}`);

	// --- Post Result ---
	const move = searchData.bestMove;
	console.debug(`[Engine] Found best move: (${move?.startCoords}) to (${move?.endCoords})`);
	postMessage(move);

	// make best move
	const full = movepiece.generateMove(current_gamefile, move!);
	movepiece.makeMove(current_gamefile, full);
	console.table(
		(Array.from(current_gamefile.boardsim.pieces.coords.entries()) as [string, number][]).map(([sq, idx]) => {
			const type = current_gamefile.boardsim.pieces.types[idx]!;
			const raw = typeutil.getRawType(type);
			const colorChar = typeutil.getColorFromType(type) === players.WHITE ? 'W' : 'B';
			return { square: sq, piece: `${colorChar}${raw}` };
		})
	);
	movepiece.rewindMove(current_gamefile);
	console.table(
		(Array.from(current_gamefile.boardsim.pieces.coords.entries()) as [string, number][]).map(([sq, idx]) => {
			const type = current_gamefile.boardsim.pieces.types[idx]!;
			const raw = typeutil.getRawType(type);
			const colorChar = typeutil.getColorFromType(type) === players.WHITE ? 'W' : 'B';
			return { square: sq, piece: `${colorChar}${raw}` };
		})
	);
	console.debug('[Engine DEBUG] Material Score:', evalState.materialScore);

	movepiece.makeMove(current_gamefile, full);
	let total = 0;
	let legalMoves: MoveDraft[] = [];
	for (let i = 0; i < 1000; i++) {
		const startTime = performance.now();
		legalMoves = helpers.generateLegalMoves(current_gamefile, current_gamefile.basegame.whosTurn);
		const endTime = performance.now();
		total += endTime - startTime;
	}
	const average = (total / 1000).toFixed(2);

	// debug print available moves in the position
	console.log(
		"Available moves:",
		legalMoves.map((move) => `${move.startCoords} -> ${move.endCoords}`).join("\n"),
		`\nGenerated ${legalMoves.length} moves in ${average} ms (average over 1000 iterations)`
	);
	movepiece.rewindMove(current_gamefile);
};

/**
 * Negamax search with alpha-beta pruning - the main search function
 * @param lf Chess game state
 * @param depth Remaining depth to search
 * @param alpha Lower bound score
 * @param beta Upper bound score
 * @param data Search data including node count, PV, etc.
 * @param is_null_move Whether this is a null move search
 * @param ply Current ply (half-move) from root
 * @returns Evaluation score from current position
 * 
 */
function negamax(lf: FullGame, depth: number, alpha: number, beta: number, data: SearchData, is_null_move: boolean = false): number {
	// Step 1: Initialization and tracking
	data.nodes++;
	let best_move: MoveDraft | null = null;
	const is_root = data.ply === 0;
	const is_null = is_null_move;
	const on_pv = beta > alpha + 1; // Check if we're on principal variation node
	let score: number;
	let hash_flag = TTFlag.LOWER_BOUND;
	
	// Update selective depth for search statistics
	data.seldepth = Math.max(data.seldepth || 0, data.ply);
	
	// Initialize principal variation tracking for this ply
	pv_length[data.ply] = data.ply;

	// Step 2: Early termination checks
	
	// Check for timeout/stop conditions periodically
	if (data.nodes % 2047 === 0 && stop_search()) {
		return 0; // Return draw score when out of time
	}
	
	// Check for max ply (to prevent stack overflow)
	if (data.ply >= MAX_PLY) {
		return evaluation.evaluate(lf);
	}
	
	// Step 3: Position context information
	const opponent = typeutil.invertPlayer(lf.basegame.whosTurn);
	const isInCheck = lf.boardsim.state.local.inCheck;
	
	// Check for horizon (depth=0) and switch to quiescence search
	if (depth <= 0) {
		return quiescenceSearch(lf, alpha, beta, data);
	}
	
	// Step 4: Mate distance pruning
	if (!is_root) {
		const mateValue = MATE_VALUE - data.ply;
		if (alpha < -mateValue) alpha = -mateValue;
		if (beta > mateValue - 1) beta = mateValue - 1;
		if (alpha >= beta) {
			return alpha;
		}
	}
	
	// Step 5: Transposition Table Probe
	const hash = TranspositionTable.generateHash(lf);
	let ttHit = false;
	let ttEval = 0;
	
	const ttResult = transpositionTable.probe(hash, alpha, beta, depth, data.ply);
	if (ttResult !== undefined) {
		ttHit = true;
		
		if (typeof ttResult === 'number') {
			// We got a score from the TT
			if (ttResult !== NO_ENTRY) {
				ttEval = ttResult;
				
				// Adjust mate scores for current ply
				if (ttEval > MATE_VALUE - 1000 && ttEval <= MATE_VALUE) {
					ttEval -= data.ply;
				} else if (ttEval < -MATE_VALUE + 1000 && ttEval >= -MATE_VALUE) {
					ttEval += data.ply;
				}
				
				// In non-PV nodes, use TT cutoffs if the depth is sufficient
				if (!is_null && !on_pv && !is_root && depth <= ttResult) {
					ttHits++;
					return ttEval;
				}
			}
		} else {
			// We got a move from the TT
			best_move = ttResult;
			if (is_root) {
				data.bestMove = best_move;
			}
		}
	}
	
	// Step 6: Static Evaluation
	const staticEval = isInCheck ? 
		-MATE_VALUE + data.ply : // When in check, worst possible score adjusted for ply
		ttHit ? ttEval : // Use TT eval if available
		is_null ? -(evalHistory[data.ply - 1]!) : // For null moves, negate previous evaluation
		evaluation.evaluate(lf); // Fresh evaluation

	// Store evaluation in history for future reference
	evalHistory[data.ply] = staticEval;
	
	// Step 7: Pruning Techniques
	if (!isInCheck && !on_pv) {
		// Reverse futility pruning - static evaluation is so good we can likely prune
		if (depth < 3 && Math.abs(beta) < MATE_SCORE) {
			const rfp_margin = depth === 1 ? 120 : 60;
			if (staticEval - rfp_margin > beta) {
				return staticEval;
			}
		}

		// Extended futility pruning - position evaluation + margin still can't reach alpha
		if (depth < 5 && !isInCheck && Math.abs(alpha) < MATE_SCORE) {
			const efp_margin = 100 * depth; 
			if (staticEval + efp_margin <= alpha) {
				return staticEval;
			}
		}

		
		// Check if opponent has non-pawn pieces (used for pruning decisions)
		const has_non_pawns = boardutil.getPieceCountOfGame(lf.boardsim.pieces, {
			ignoreColors: new Set([opponent]),
			ignoreRawTypes: new Set([rawTypes.PAWN, rawTypes.KING])
		}) > 0;

		// Null move pruning - skip a turn to see if position is still good
		if (depth >= 3 && has_non_pawns) {
			// Use NMP_R as base reduction and dynamically adjust based on depth
			const R = NMP_R + Math.floor(depth / 6);
			
			// Create null move state
			// Null moves are now represented by the king moving to its own square
			const kingCoords = getKingCoordinates(lf, lf.basegame.whosTurn);
			const nullMoveDraft: MoveDraft = {
				startCoords: kingCoords,
				endCoords: kingCoords,
			};
			const nullMove = movepiece.generateMove(lf, nullMoveDraft);
			movepiece.makeMove(lf, nullMove); 
			
			// Search opponent's position with reduced depth
			const nullScore = -negamax(
				lf,
				depth - 1 - R,
				-beta,
				-beta + 1,
				data,
				true
			);

			movepiece.rewindMove(lf);

			if (stop_search()) {
				return TIME_UP;
			}
			
			// If even with a free move the opponent can't improve their position enough
			// then we can safely prune this branch
			if (nullScore >= beta) {
				return beta;
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
	const fp_margin = staticEval + 90 * depth * (1 + Math.log(Math.max(1, depth)));

	// Timeout check
	if (stop_search()) {
		return TIME_UP;
	}


	// --- Generate Moves ---
	const legalMoves = helpers.generateLegalMoves(lf, lf.basegame.whosTurn);

	if (data.follow_pv) {
		helpers.enable_pv_scoring(legalMoves, pv_table, data);
	}

	// --- Move Ordering (more efficient approach) ---
	// Instead of sorting the entire array at once (O(n log n)), we'll use:
	// 1. Assign scores to all moves (O(n))
	// 2. Select the best move at each step (O(n))
	const moveScores = helpers.assignMoveScores(
		lf, 
		legalMoves, 
		data, 
		pv_table, 
		killer_moves, 
		history_heuristic_table, 
		best_move
	);

	let bestScore = -INFINITY;
	let skip_quiet = false;
	let moves_searched = 0;

	// --- Search Loop (PVS) with incremental move selection ---
	for (let i = 0; i < legalMoves.length; i++) {
		// Select the best move at this position (partial selection sort)
		const bestMoveIndex = helpers.selectNextBestMove(legalMoves, moveScores, i);
		const currentMoveDraft = legalMoves[bestMoveIndex]!;

		// Generate the full move from the draft
		const fullMove = movepiece.generateMove(lf, currentMoveDraft); 

		if (!fullMove) {
			console.error("[Engine] Failed to generate full move for draft:", currentMoveDraft);
			continue; // Skip invalid move generation
		}
		
		// For legal moves, we'll continue execution and avoid rewinding until later

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

		// Check if we captured a king (illegal move in search context)
		const capturedPiece = boardutil.getPieceFromCoords(lf.boardsim.pieces, currentMoveDraft.endCoords);
		const capturedPieceType: number | undefined = capturedPiece?.type;

		movepiece.makeMove(lf, fullMove);

		// Get king coordinates on the fly for our color (the one that just moved)
		// After making a move, whosTurn is now the opponent's color, so our color is the opposite
		const ourColor = lf.basegame.whosTurn === players.WHITE ? players.BLACK : players.WHITE;
		const kingCoords = getKingCoordinates(lf, ourColor);
		// Check if our king would be under attack after the move
		const kingInCheck = checkdetection.isSquareBeingAttacked(lf, kingCoords, lf.basegame.whosTurn);

		// If the move leaves the king in check, it's illegal
		if (kingInCheck) {
			movepiece.rewindMove(lf);
			return ILLEGAL_MOVE;
		}
		
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
		// Rewind the move and restore previous evaluation state
		// No special tracking needed anymore since we use typeRanges directly
		// Position evaluation is handled in evaluation.ts
		// Board state will be restored by movepiece.rewindMove
		
		// Execute the rewind on the board
		movepiece.rewindMove(lf);
		
		// Update evaluation state for undoing a move - re-use capturedPieceType from above
		helpers.updateEvalUndoMove(lf, fullMove, capturedPieceType);
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

	if (moves_searched === 0) {
		if (isInCheck) {
			return -MATE_VALUE + data.ply;
		} else {
			return 0;
		}
	}

	transpositionTable.store(hash, depth, hash_flag, alpha, best_move, data.ply);
	return alpha;
}

/**
 * Quiescence search explores only 'noisy' moves to avoid the horizon effect.
 * This includes captures and (limited) checking moves.
 */
function quiescenceSearch(
	lf: FullGame,
	alpha: number,
	beta: number,
	data: SearchData
): number {
	// Step 1: Preparation
	data.nodes++;
	
	// Step 1.1: Check for timeout
	if (data.nodes % 2047 === 0 && stop_search()) {
		return TIME_UP;
	}

	// Step 1.2: Initialize PV length for this ply
	pv_length[data.ply] = data.ply;
	
	// Step 1.3: Detect if we're at max depth
	if (data.ply >= MAX_PLY) {
		return evaluation.evaluate(lf);
	}
	
	// Step 1.4: Hard depth limit for quiescence to avoid infinite recursion
	const MAX_QUIESCENCE_DEPTH = 10;
	if (data.ply >= MAX_QUIESCENCE_DEPTH) {
		return evaluation.evaluate(lf);
	}

	// Step 1.5: Check if we're in check
	const isInCheck = lf.boardsim.state.local.inCheck;

	// Step 2: Transposition Table Probe
	const hash = TranspositionTable.generateHash(lf);
	let hashMove: MoveDraft | null = null;
	
	// Try to use transposition table result if we have it
	const ttEntry = transpositionTable.probe(hash, alpha, beta, 0, data.ply);
	if (typeof ttEntry === 'number') {
		// We found a valid entry with a score we can use
		if (ttEntry !== NO_ENTRY) {
			ttHits++;
			return ttEntry;
		}
	} else if (ttEntry) {
		// We found an entry with a move but we can't use the score directly
		hashMove = ttEntry;
	}

	// Step 3: Static Evaluation and Stand Pat
	let bestScore = -MATE_VALUE + data.ply; // Worst possible score, adjusted for ply
	const staticEval = isInCheck ? bestScore : evaluation.evaluate(lf);
	
	if (!isInCheck) {
		// Stand-pat logic: only applies when not in check
		bestScore = staticEval;
		
		// Stand-pat pruning
		if (bestScore >= beta) {
			return beta;
		}
		if (bestScore > alpha) {
			alpha = bestScore;
		}
	}
	
	// Enhanced delta pruning parameters - used for futility pruning of captures
	const futilityMargin = 150; // Typical value of a pawn + a bit more
	const futilityBase = staticEval + futilityMargin;

	// Step 3: Move Generation
	const allMoves = helpers.generateLegalMoves(lf, lf.basegame.whosTurn);
	
	// Assign move scores to prioritize promising captures and checks
	const moveScores = helpers.assignMoveScores(
		lf, 
		allMoves, 
		data, 
		pv_table, 
		killer_moves, 
		history_heuristic_table, 
		hashMove
	);

	// Step 4: Define the maximum depth for checking moves
	const MAX_CHECK_DEPTH = 4;

	// Step a Helper function to avoid duplicating move logic
	function makeMoveAndGetScore(move: MoveDraft, capturedPieceType: number | undefined): number {
		const fullMove = movepiece.generateMove(lf, move);

		movepiece.makeMove(lf, fullMove);
		helpers.updateEvalAfterMove(lf, fullMove, capturedPieceType);

		// Get king coordinates for the current player
		const kingCoords = lf.basegame.whosTurn === players.WHITE ? evalState.blackKingCoords : evalState.whiteKingCoords;

		// Check if our king would be under attack after the move
		const kingInCheck = checkdetection.isSquareBeingAttacked(lf, kingCoords, lf.basegame.whosTurn);

		// If the move leaves the king in check, it's illegal
		if (kingInCheck) {
			helpers.updateEvalUndoMove(lf, fullMove, capturedPieceType);
			movepiece.rewindMove(lf);
			return ILLEGAL_MOVE;
		}

		// Only proceed with evaluation and recursive search for legal moves
		data.ply++;
		
		const previousMove = data.previousMove;
		data.previousMove = fullMove;
		
		const score = -quiescenceSearch(lf, -beta, -alpha, data);
		
		data.previousMove = previousMove;
		data.ply--;
		movepiece.rewindMove(lf);
		helpers.updateEvalUndoMove(lf, fullMove, capturedPieceType);

		if (STOP) {
			return TIME_UP;
		}

		return score;
	}

	// Step 5: Process moves using more efficient move ordering
	let captureRaisedAlpha = false;
	let searched_moves = 0;
	
	// Use incremental move selection (like in negamax) instead of sorting the entire array
	for (let i = 0; i < allMoves.length; i++) {
		// Select the best move at this position (partial selection sort)
		const bestMoveIndex = helpers.selectNextBestMove(allMoves, moveScores, i);
		const move = allMoves[bestMoveIndex]!;
		
		// Skip if it's not a move we want to consider in quiescence search
		// Check if this is a capture by seeing if there's a piece at the destination
		const targetPiece = boardutil.getPieceFromCoords(lf.boardsim.pieces, move.endCoords);
		const isCapture = targetPiece !== undefined && typeutil.getColorFromType(targetPiece.type) !== lf.basegame.whosTurn;
		
		// Check if move gives check by generating and testing the move
		let isCheck: boolean = false;
		if (!isCapture) {
			// Only check non-captures for check status to avoid redundant work
			const fullMove = movepiece.generateMove(lf, move);
			if (fullMove) {
				movepiece.makeMove(lf, fullMove);
				isCheck = lf.boardsim.state.local.inCheck !== false;
				movepiece.rewindMove(lf);
			}
		}

		// Only consider certain types of moves based on position
		if (isInCheck) {
			// When in check, we must consider all evasions
			// Continue with processing
		} else if (!isCapture && !isCheck) {
			// Skip non-captures and non-checks when not in check
			continue;
		} else if (!isCapture && data.ply >= MAX_CHECK_DEPTH) {
			// Skip checking moves beyond our depth limit
			continue;
		} else if (!isCapture && captureRaisedAlpha) {
			// Skip checking moves if a capture already raised alpha
			continue;
		}
		
		// Apply futility pruning
		let isFutile = false;
		if (isCapture) {
			// Delta pruning for captures
			const targetPiece = boardutil.getPieceFromCoords(lf.boardsim.pieces, move.endCoords);
			if (targetPiece) {
				const captureValue = PIECE_VALUES[typeutil.getRawType(targetPiece.type)] || 0;
				isFutile = futilityBase + captureValue < alpha;
			}
		} else if (isCheck) {
			// Stricter futility for checks
			isFutile = futilityBase + 200 < alpha;
		}
		
		// Skip futile moves based on depth
		if (isFutile) {
			if (isCapture && data.ply > 2) continue;
			if (isCheck && data.ply > 1) continue;
		}

		const capturedPiece = boardutil.getPieceFromCoords(lf.boardsim.pieces, move.endCoords);
		const capturedPieceType: number | undefined = capturedPiece?.type;
		
		// Make the move and get the score
		const score = makeMoveAndGetScore(move, capturedPieceType);
		if (score === TIME_UP) return TIME_UP;
		if (score === ILLEGAL_MOVE) continue;

		searched_moves++;

		if (score > bestScore) {
			bestScore = score;
			if (score > alpha) {
				alpha = score;
				
				// Track if a capture raised alpha (for pruning checks later)
				if (isCapture) {
					captureRaisedAlpha = true;
				}
				
				if (score >= beta) {
					return beta;
				}
			}
		}
	}

	if (searched_moves === 0) {
		if (isInCheck) {
			return -MATE_VALUE + data.ply; // Checkmate
		} else {
			return 0; // Stalemate
		}
	}

	// Step 6: Store position in transposition table before returning
	// Only store positions that aren't just using the static evaluation
	if (bestScore > -MATE_VALUE + 100) {
		let flag = TTFlag.EXACT;
		if (bestScore <= alpha) {
			// Failed low, this is an upper bound
			flag = TTFlag.UPPER_BOUND;
		} else if (bestScore >= beta) {
			// Failed high, this is a lower bound
			flag = TTFlag.LOWER_BOUND;
		}

		// Store the result in the transposition table
		// Note: Store function expects (hash, depth, flag, score, bestMove, ply)
		transpositionTable.store(
			hash,
			0, // depth is 0 for quiescence search
			flag,
			bestScore,
			null, // No best move to store from quiescence search
			data.ply
		);
	}

	// Return best score found, which would be alpha if any move improved it
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
	lf: FullGame, 
	move: Move, 
	depth: number, 
	history_table: Map<string, number>,
	data: SearchData
): void {
	const movedPiece = boardutil.getTypeFromCoords(lf.boardsim.pieces, move.startCoords)!;
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
            boardutil.getTypeFromCoords(lf.boardsim.pieces, data.previousMove.startCoords)!, 
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
function findBestMove(lf: FullGame, searchData: SearchData) {
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
	evalHistory = Array(MAX_PLY).fill(0);


	let prevScore = 0; // Score from previous iteration
	for (let depth = 1; depth <= MAX_PLY; depth++) {
		if (stop_search()) {
			break;
		}

		searchData.follow_pv = true;
		searchData.numExtensions = 0;
		
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
			let currentAlpha = Math.max(-INFINITY, prevScore - WINDOW_SIZE);
			let currentBeta = Math.min(INFINITY, prevScore + WINDOW_SIZE);
			
			score = negamax(lf, depth, currentAlpha, currentBeta, searchData, true);

			if (stop_search()) {
				break;
			}
			
			// If the score falls outside our window, gradually widen the failing bound
			if (score <= currentAlpha || score >= currentBeta) {
				console.debug(`[Engine] Aspiration window failed at depth ${depth}, score: ${score}, window: [${currentAlpha}, ${currentBeta}]`);
				
				// Gradual widening factors - multiply window by these values on consecutive fails
				const wideningFactors = [4, 8, 16, 24];
				let currentFactor = 0;
				
				// Re-search with gradually widening windows
				while ((score <= currentAlpha || score >= currentBeta) && currentFactor < wideningFactors.length) {
					// Widen the appropriate bound
					const delta = WINDOW_SIZE * wideningFactors[currentFactor]!;
					
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

		if (pv_table[0] && pv_table[0][0]) {
			searchData.bestMove = pv_table[0][0];
		}

		if (stop_search()) {
			break;
		}
		
		// Store score for next iteration's window
		prevScore = score;

		let printString = `[Engine] info depth ${depth} seldepth ${searchData.seldepth} nodes ${searchData.nodes}`;
		let mate;
		if (score > -MATE_VALUE && score < -MATE_SCORE) {
			printString += ` score mate ${-(score + MATE_VALUE) / 2 - 1} pv`;
			mate = true;
		} else if (score > MATE_SCORE && score < MATE_VALUE) {
			printString += ` score mate ${(MATE_VALUE - score) / 2 + 1} pv`;
			mate = true;
		} else {
			printString += ` score cp ${Math.round(score)} pv`;
			mate = false;
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
		
		// if checkmate is found and depth is high enough, return
		if (mate && depth >= 10) {
			break;
		}
	}

	transpositionTable.incrementAge();
}