/**
 * Implements a relatively simple chess engine for infinite chess.
 * This engine incorporates common techniques found in traditional chess bots,
 * adapted to function within the unique constraints of an infinite chessboard.
 * 
 * @author FirePlank
 */

// @ts-ignore
import type { gamefile } from '../../../chess/logic/gamefile.js';
import type { MoveDraft } from '../../../chess/logic/movepiece.js';
import typeutil, { rawTypes } from '../../../chess/util/typeutil.js';
import boardutil from '../../../chess/util/boardutil.js';
import movepiece from '../../../chess/logic/movepiece.js';
import gameformulator from '../gameformulator.js';
import evaluation from './hydrochess/evaluation.js';
import helpers from './hydrochess/helpers.js';
import { TranspositionTable, TTFlag } from './hydrochess/tt.js';
import checkdetection from '../../../chess/logic/checkdetection.js';

export const MAX_PLY = 64;
const SEARCH_TIMEOUT_MS = 4000;
const INFINITY = 32000;
const MATE_VALUE = INFINITY - 150;
const MATE_SCORE = INFINITY - 300;
const NO_ENTRY = INFINITY - 500;
const TIME_UP = 32000 + 500;

const NMP_R = 3;
const LMR_MIN_DEPTH = 3;
const LMR_REDUCTION = 1;
let startTime = performance.now();

let STOP = false;

const transpositionTable = new TranspositionTable(64); // in MB
let ttHits = 0;
let killer_moves: Array<Array<MoveDraft | null>> = Array(MAX_PLY).fill(null).map(() => [null, null]);
let history_heuristic_table: Map<string, number> = new Map();
let pv_table: (MoveDraft | null | undefined)[][] = Array(MAX_PLY).fill(null).map(() => [null, null]);
let pv_length: number[] = Array(MAX_PLY).fill(0);

export interface SearchData {
  nodes: number;
  ply: number;
  bestMove: MoveDraft | null;
  startDepth: number;
  score_pv: boolean;
  follow_pv: boolean;
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

	const start = performance.now();
	findBestMove(current_gamefile);
	const duration = (performance.now() - start).toFixed(2);
	console.debug(`[Engine] Calculation took ${duration} ms. TT Hits: ${ttHits}`);

	// --- Post Result ---
	const move = pv_table[0]![0];
	console.debug(`[Engine] Found best move: (${move?.startCoords}): (${move?.endCoords})`);
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
	const isInCheck = checkdetection.isPlayerInCheck(lf, lf.whosTurn);

	if (isInCheck) {
		depth++;
	}

	const hash = TranspositionTable.generateHash(lf);

	// --- Transposition Table Probe ---
	const ttEntry = transpositionTable.probe(hash, depth, data.ply);
	if (ttEntry) {
		if (ttEntry.depth >= depth) {
			ttHits++;
			if (ttEntry.flag === TTFlag.EXACT) {
				return ttEntry.score;
			} else if (ttEntry.flag === TTFlag.LOWER_BOUND) {
				alpha = Math.max(alpha, ttEntry.score);
			} else if (ttEntry.flag === TTFlag.UPPER_BOUND) {
				beta = Math.min(beta, ttEntry.score);
			}
			if (alpha >= beta) {
				return ttEntry.score;
			}
		}
	}


	// every 2047 nodes
	if (data.nodes % 2047 === 0 && stop_search()) {
		return 0;
	}

	// static evaluation
	const evalScore = evaluation.evaluate(lf);

	if (!isInCheck && !pv_node) {
		// evaluation pruning
		if (depth < 3 && Math.abs(beta - 1) > -49000 + 100) {
			if (evalScore - 100 * depth >= beta) {
				return evalScore - 100;
			}
		}

		// you can do razoring and fp here if you want

		// --- Null Move Pruning (NMP) ---
		if (null_move) {
			// Simple heuristic: Assume not zugzwang if player has pieces other than pawns/king
			const has_major_or_minor_pieces = boardutil.getPieceCountOfGame(lf.pieces, {
				ignoreColors: new Set([opponent]),
				ignoreRawTypes: new Set([rawTypes.PAWN, rawTypes.KING])
			}) > 0;

			if (has_major_or_minor_pieces) {
				data.ply += 1;
				// Make a null move (just switch turn)
				const originalTurn = lf.whosTurn;
				lf.whosTurn = opponent;
				const nullScore = -negamax(lf, depth - 1 - NMP_R, -beta, -beta + 1, data, false);
				// Undo null move
				lf.whosTurn = originalTurn;
				data.ply -= 1;

				// return if time is up
				if (STOP) {
					return NO_ENTRY;
				}

				if (nullScore >= beta) {
					return beta;
				}
			}
		}

		// --- Razoring (Static Futility Pruning) ---
		const score = evalScore + 100;
		if (score < beta) {
			if (depth === 1) {
				const new_score = quiescenceSearch(lf, alpha, beta, data);
				if (new_score < beta) {
					return Math.max(new_score, score);
				}
			}
		}
	}

	const fp_margin = evalScore + 97 * depth;

	// Timeout check
	if (stop_search()) {
		return TIME_UP;
	}


	// --- Generate and Order Moves ---
	const legalMoves = helpers.generateLegalMoves(lf, lf.whosTurn);

	if (data.follow_pv) {
		helpers.enable_pv_scoring(legalMoves, pv_table, data);
	}

	// --- Move Ordering ---
	legalMoves.sort((a, b) =>
		evaluation.scoreMove(b, lf, data, pv_table, killer_moves, history_heuristic_table) -
    evaluation.scoreMove(a, lf, data, pv_table, killer_moves, history_heuristic_table)
	);

	// Check for terminal nodes (checkmate/stalemate)
	if (legalMoves.length === 0) {
		if (isInCheck) {
			return -MATE_VALUE + data.ply; // Checkmate
		} else {
			return 0; // Stalemate
		}
	}

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
			if (depth < 8 && is_quiet && !is_killer && fp_margin <= alpha && Math.abs(alpha) < INFINITY - 100) {
				skip_quiet = true;
				continue;
			}
		}

		movepiece.makeMove(lf, fullMove); // Make the move
		data.ply += 1;

		// full depth search
		if (moves_searched === 0) {
			score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
		} else {
			if (moves_searched >= LMR_MIN_DEPTH && depth >= LMR_REDUCTION && !isInCheck && is_quiet && !fullMove.promotion) {
				score = -negamax(lf, depth - 2, -alpha - 1, -alpha, data, true);
			} else {
				score = alpha + 1;
			}

			if (score > alpha) {
				score = -negamax(lf, depth - 1, -alpha - 1, -alpha, data, true);
				if (score > alpha && score < beta) {
					score = -negamax(lf, depth - 1, -beta, -alpha, data, true);
				}
			}
		}

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
				helpers.updateHistoryScore(lf, currentMoveDraft, depth, history_heuristic_table);
			}

			// write PV move
			pv_table[data.ply]![data.ply] = currentMoveDraft;
			// loop over the next ply
			for (let i = data.ply + 1; i < pv_length[data.ply]! + 1; i++) {
				pv_table[data.ply]![i] = pv_table[data.ply + 1]![i];
			}

			// adjust pv length
			pv_length[data.ply] = pv_length[data.ply + 1]!;

			if (score >= beta) {
				// store hash entry with the score equal to beta
				transpositionTable.store(hash, depth, TTFlag.UPPER_BOUND, beta, best_move, data.ply);

				if (is_quiet) {
					// store killer moves
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
	const evalScore = evaluation.evaluate(lf);

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

	const allMoves = helpers.generateLegalMoves(lf, lf.whosTurn);

	const captureMoves = allMoves.filter(move => {
		const targetPiece = boardutil.getPieceFromCoords(lf.pieces, move.endCoords);
		return targetPiece !== undefined && typeutil.getColorFromType(targetPiece.type) !== lf.whosTurn;
	});

	const scoredCaptures = captureMoves.map(move => ({
		move: move,
		score: evaluation.scoreMove(move, lf, data, pv_table, killer_moves, history_heuristic_table)
	})).sort((a, b) => b.score - a.score);

	// --- Explore Noisy Moves ---
	for (const { move } of scoredCaptures) {
		const fullMove = movepiece.generateMove(lf, move);
		movepiece.makeMove(lf, fullMove);
		data.ply++;
		const score = -quiescenceSearch(lf, -beta, -alpha, data);
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
		return true;
	}
	return false;
}

/**
 * Iterative deepening search driver.
 * Calls negamax for increasing depths until timeout or max depth is reached.
 * @param lf The current game state.
 */
function findBestMove(lf: gamefile) {
	STOP = false;
	startTime = performance.now();

	// Reset search-specific data before starting
	killer_moves = Array(MAX_PLY).fill(null).map(() => [null, null]); // Clear killers
	history_heuristic_table = new Map(); // Clear history
	pv_table = Array(MAX_PLY).fill(null).map(() => [null, null]);
	pv_length = Array(MAX_PLY).fill(0);

	const searchData: SearchData = { nodes: 0, bestMove: null, startDepth: 0, ply: 0, score_pv: false, follow_pv: true };

	// Iterative deepening loop
	for (let depth = 1; depth <= MAX_PLY; depth++) {
		if (stop_search()) {
			break;
		}

		searchData.follow_pv = true;
		
		helpers.decayHistoryScores(history_heuristic_table); // Decay scores at the start of each depth iteration
		const score = negamax(lf, depth, -INFINITY, INFINITY, searchData, true);

		if (stop_search()) {
			break;
		}

		let printString = `info depth ${depth} nodes ${searchData.nodes}`;
		if (score > -MATE_VALUE && score < -MATE_SCORE) {
			printString += ` score mate ${pv_length[0]! / 2 - 1} pv`;
		} else if (score > MATE_SCORE && score < MATE_VALUE) {
			printString += ` score mate ${pv_length[0]! / 2 + 1} pv`;
		} else {
			printString += ` score cp ${Math.round(score)} pv`;
		}
		
		// loop over moves in PV
		for (let i = 0; i < pv_length[0]!; i++) {
			const move = pv_table[0]![i];
			if (move) {
				printString += ` (${move.startCoords}): (${move.endCoords})`;
			} else {
				printString += ' null';
				break;
			}
		}

		console.debug(printString);
	}

	transpositionTable.incrementAge();
}