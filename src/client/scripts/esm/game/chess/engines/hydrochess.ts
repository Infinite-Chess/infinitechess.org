
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
import type { Player } from '../../../chess/util/typeutil.js';
import typeutil, { rawTypes } from '../../../chess/util/typeutil.js';
import boardutil from '../../../chess/util/boardutil.js';
import movepiece from '../../../chess/logic/movepiece.js';
import gameformulator from '../gameformulator.js';
import evaluation from './hydrochess/evaluation.js';
import helpers from './hydrochess/helpers.js';
import { TranspositionTable, TTFlag } from './hydrochess/tt.js';
import checkdetection from '../../../chess/logic/checkdetection.js';
import jsutil from '../../../util/jsutil.js';

const MAX_DEPTH = 64;
const SEARCH_TIMEOUT_MS = 4000;
const MATE_SCORE = 1000000;
const QUIESCENCE_MAX_DEPTH = 4;
const NMP_R = 3;
const NMP_MIN_DEPTH = 3;
const RAZORING_MARGIN = 300;
const LMR_MIN_DEPTH = 3;
const LMR_MOVE_COUNT_THRESHOLD = 3;
const LMR_REDUCTION = 1;

const transpositionTable = new TranspositionTable(64); // in MB
let ttHits = 0;

interface SearchData {
  nodes: number;
  bestMove: MoveDraft | null;
  startDepth: number;
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
	const startTime = performance.now();

	const bestMove: MoveDraft | null = findBestMove(current_gamefile);
	const endTime = performance.now();
	const duration = (endTime - startTime).toFixed(2);
	console.debug(`[Engine] Calculation took ${duration} ms. TT Hits: ${ttHits}`);

	// --- Post Result ---
	if (bestMove) {
		console.debug(`[Engine] Found best move: ${JSON.stringify(bestMove)}`);
		postMessage(bestMove);
	} else {
		console.error("[Engine] No legal moves found.");
	}
};

/**
 * The main search function using Negamax with alpha-beta pruning and PVS.
 * @param lf The current logical gamefile state.
 * @param depth The current search depth.
 * @param alpha The alpha value for pruning.
 * @param beta The beta value for pruning.
 * @param player The player whose turn it is.
 * @param startTime The time the search started.
 * @param data Object to store search data (nodes, best move).
 * @param ply Distance from the root node (used for mate scoring and NMP condition).
 * @param pvMoveFromID The PV move from the previous iteration (only relevant at ply 0).
 * @returns The evaluation score for the current position.
 */
function negamax(lf: gamefile, depth: number, alpha: number, beta: number, player: Player, startTime: number, data: SearchData, ply: number, pvMoveFromID: MoveDraft | null): number {
	data.nodes++;

	// Timeout check
	if (performance.now() - startTime > SEARCH_TIMEOUT_MS) {
		return beta;
	}

	const alphaOrig = alpha;
	const hash = TranspositionTable.generateHash(lf);

	// --- Transposition Table Probe ---
	const ttEntry = transpositionTable.probe(hash, depth, ply);
	let ttBestMove: MoveDraft | null = null;

	if (ttEntry) {
		ttBestMove = ttEntry.bestMove;
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

	// --- Base Case: Depth Reached or Terminal Node ---
	if (depth === 0) {
		return quiescenceSearch(lf, QUIESCENCE_MAX_DEPTH, alpha, beta, player, data, startTime);
	}

	const opponent = typeutil.invertPlayer(player);
	const isInCheck = checkdetection.isPlayerInCheck(lf, player);

	// --- Null Move Pruning (NMP) ---
	// Conditions: Not in check, depth is sufficient, not in zugzwang (heuristic)
	if (!isInCheck && depth >= NMP_MIN_DEPTH && ply > 0) {
		// Simple heuristic: Assume not zugzwang if player has pieces other than pawns/king
		const has_major_or_minor_pieces = boardutil.getPieceCountOfGame(lf.pieces, {
			ignoreColors: new Set([opponent]),
			ignoreRawTypes: new Set([rawTypes.PAWN, rawTypes.KING])
		}) > 0;

		if (has_major_or_minor_pieces) {
			// Make a null move (just switch turn)
			const originalTurn = lf.whosTurn;
			lf.whosTurn = opponent;
			const nullScore = -negamax(lf, depth - 1 - NMP_R, -beta, -beta + 1, opponent, startTime, data, ply + 1, null);
			// Undo null move
			lf.whosTurn = originalTurn;

			if (nullScore >= beta) {
				return beta;
			}
		}
	}

	// --- Razoring (Static Futility Pruning) ---
	if (depth === 1 && !isInCheck) {
		const static_eval = evaluation.evaluatePosition(lf, player);
		if (static_eval + RAZORING_MARGIN <= alpha) {
			return alpha;
		}
	}

	// --- Generate and Order Moves ---
	const legalMoves = helpers.generateLegalMoves(lf, player);

	// --- Move Ordering ---
	legalMoves.sort((a, b) =>
		evaluation.scoreMove(b, lf, ttBestMove, pvMoveFromID, ply) -
    evaluation.scoreMove(a, lf, ttBestMove, pvMoveFromID, ply)
	);

	// Check for terminal nodes (checkmate/stalemate)
	if (legalMoves.length === 0) {
		if (isInCheck) {
			return -MATE_SCORE + ply; // Checkmate
		} else {
			return 0; // Stalemate
		}
	}

	let bestScore = -Infinity; // Re-initialize bestScore
	let bestMoveForTT: MoveDraft | null = null; // Best move found *at this node*

	// --- Search Loop (PVS) ---
	let isFirstMove = true;
	for (let i = 0; i < legalMoves.length; i++) {
		const currentMoveDraft = legalMoves[i]!;
		const fullMove = movepiece.generateMove(lf, currentMoveDraft); // Generate full move first
		movepiece.makeMove(lf, fullMove); // Make move on the *original* lf (will be rewound)
		const nextPlayer = typeutil.invertPlayer(player); // Use typeutil.invertPlayer
		let score;

		if (isFirstMove) {
			// Full window search for the first move (expected PV move)
			score = -negamax(lf, depth - 1, -beta, -alpha, nextPlayer, startTime, data, ply + 1, null); // Pass the modified lf
			isFirstMove = false;
		} else {
			// --- Late Move Reduction (LMR) --- (Attempt reduction before null-window search)
			let reduction = 0;
			const isCapture = !!fullMove.flags.capture;
			const givesCheck = checkdetection.isPlayerInCheck(lf, nextPlayer); 
			
			if (depth >= LMR_MIN_DEPTH &&
				i >= LMR_MOVE_COUNT_THRESHOLD &&
				!isInCheck && // Don't reduce if in check
				!givesCheck &&
				!isCapture &&
				!fullMove.promotion
			) {
				reduction = LMR_REDUCTION; // Apply standard reduction
				// TODO: More sophisticated reduction based on move history/etc.
			}

			// Null window search (scout search) with potential reduction
			score = -negamax(lf, depth - 1 - reduction, -alpha - 1, -alpha, nextPlayer, startTime, data, ply + 1, null); // Pass the modified lf

			// If LMR was applied AND null window search failed high, re-search without reduction first
			if (reduction > 0 && score > alpha) {
				score = -negamax(lf, depth - 1, -alpha - 1, -alpha, nextPlayer, startTime, data, ply + 1, null); // Pass the modified lf
			}

			// If null window search failed high (even after removing reduction),
			// it means this move might be better than the current best (alpha).
			// Re-search with the full window [-beta, -alpha] to get the exact score.
			if (score > alpha && score < beta) { // Check score < beta avoids redundant search if it's going to fail high anyway
				score = -negamax(lf, depth - 1, -beta, -alpha, nextPlayer, startTime, data, ply + 1, null); // Pass the modified lf
			}
		}

		movepiece.rewindMove(lf); // Rewind the move on the original board

		// Update best score and move
		if (score > bestScore) {
			bestScore = score;
		}

		// Alpha-Beta Pruning
		if (score > alpha) {
			alpha = score;
			bestMoveForTT = currentMoveDraft; // Update the best move found at this node
			// If it's the root node, update the globally best move for the *iteration*
			if (ply === 0) {
				data.bestMove = currentMoveDraft;
			}
		}

		if (alpha >= beta) {
			// Beta-cutoff: This move is too good, opponent won't allow it.
			// Store potentially good move (killer heuristic can be added later)
			break;
		}

		// Check for timeout frequently within the loop
		if (performance.now() - startTime > SEARCH_TIMEOUT_MS) {
			return beta;
		}
	}

	// --- Transposition Table Store ---
	let ttFlag: TTFlag;
	if (bestScore <= alphaOrig) {
		ttFlag = TTFlag.UPPER_BOUND; // Failed low
	} else if (bestScore >= beta) {
		ttFlag = TTFlag.LOWER_BOUND; // Failed high (beta cutoff)
	} else {
		ttFlag = TTFlag.EXACT; // Score is within the (alpha, beta) window
	}

	// Store in TT only if the move is considered reliable
	if (bestMoveForTT || ttFlag === TTFlag.EXACT || ttFlag === TTFlag.LOWER_BOUND) { // Avoid storing useless upper bounds without a move?
		transpositionTable.store(hash, depth, ttFlag, bestScore, bestMoveForTT, ply);
	}

	return bestScore; // Return the best score found for this node
}

/**
 * Quiescence Search: Extends the search depth for "noisy" moves (captures)
 * to avoid the horizon effect in tactical situations.
 */
function quiescenceSearch(
	lf: gamefile,
	qDepth: number,
	alpha: number,
	beta: number,
	player: Player,
	searchData: SearchData,
	startTime: number
): number {
	searchData.nodes++;

	// Timeout check
	if (performance.now() - startTime > SEARCH_TIMEOUT_MS) {
		return beta;
	}

	const stand_pat = evaluation.evaluatePosition(lf, player);

	if (stand_pat >= beta) {
		return beta;
	}

	alpha = Math.max(alpha, stand_pat);

	if (qDepth <= 0) {
		return alpha;
	}

	const opponent = typeutil.invertPlayer(player);
	const allMoves = helpers.generateLegalMoves(lf, player);

	const captureMoves = allMoves.filter(move => {
		const targetPiece = boardutil.getPieceFromCoords(lf.pieces, move.endCoords);
		return targetPiece !== undefined && typeutil.getColorFromType(targetPiece.type) !== player;
	});

	const scoredCaptures = captureMoves.map(move => ({
		move: move,
		score: evaluation.scoreMove(move, lf, null, null, Infinity)
	})).sort((a, b) => b.score - a.score);

	// --- Explore Noisy Moves ---
	for (const { move } of scoredCaptures) {
		const fullMove = movepiece.generateMove(lf, move);
		movepiece.makeMove(lf, fullMove);
		const score = -quiescenceSearch(lf, qDepth - 1, -beta, -alpha, opponent, searchData, startTime);
		movepiece.rewindMove(lf);

		if (score >= beta) {
			return beta;
		}
		alpha = Math.max(alpha, score);
	}

	return alpha;
}

/**
 * Performs an iterative deepening search.
 * @param lf The starting logical gamefile state.
 * @returns The best MoveDraft found, or null if no move is found or timeout occurs.
 */
function findBestMove(lf: gamefile): MoveDraft | null {
	const startTime = performance.now();
	let bestMoveOverall: MoveDraft | null = null;
	let pvMove: MoveDraft | null = null; // Principal Variation move from previous iteration
	const player = lf.whosTurn;
	let lastCompletedDepth = 0;

	const initialLfCopy = jsutil.deepCopyObject(lf);

	console.debug(`[Engine] Starting search for ${typeutil.strcolors[player]}`);
	for (let depth = 1; depth <= MAX_DEPTH; depth++) {
		const searchData: SearchData = { nodes: 0, bestMove: null, startDepth: depth };
		const score = negamax(initialLfCopy, depth, -MATE_SCORE, MATE_SCORE, player, startTime, searchData, 0, pvMove);

		const elapsedTime = performance.now() - startTime;

		// Check timeout *after* negamax call for the depth returns
		if (elapsedTime > SEARCH_TIMEOUT_MS && lastCompletedDepth > 0) {
			console.debug(`[Engine] Timeout reached at depth ${depth}. Using best move from depth ${lastCompletedDepth}.`);
			break;
		}

		// Check if negamax returned due to timeout *during* its execution
		// Simple check: if time exceeded and no best move found at root, maybe timeout?
		if (elapsedTime > SEARCH_TIMEOUT_MS && !searchData.bestMove && lastCompletedDepth > 0) {
			console.debug(`[Engine] Search likely interrupted by timeout at depth ${depth}. Using best move from depth ${lastCompletedDepth}.`);
			break;
		}

		if (searchData.bestMove) {
			bestMoveOverall = searchData.bestMove;
			pvMove = searchData.bestMove; // Update PV move for next iteration
			lastCompletedDepth = depth;
			console.debug(`[Engine] Depth ${depth} complete. Score: ${score}. Best move: ${JSON.stringify(pvMove)}. Nodes: ${searchData.nodes}. Time: ${elapsedTime.toFixed(0)}ms`);
		} else if (elapsedTime <= SEARCH_TIMEOUT_MS) {
			// Maybe mate/stalemate if no move found and no timeout
			console.debug(`[Engine] Depth ${depth} complete. No move found (Mate/Stalemate?). Score: ${score}. Nodes: ${searchData.nodes}. Time: ${elapsedTime.toFixed(0)}ms`);
			// Stop if definitive mate/stalemate score found
			if (score === 0 || score <= -MATE_SCORE + MAX_DEPTH) { // Allow for ply depth in mate score
				break;
			}
		}

		// --- Check for Mate Score ---
		if (score >= MATE_SCORE - MAX_DEPTH || score <= -MATE_SCORE + MAX_DEPTH) {
			console.debug(`[Engine] Mate score detected at depth ${depth}. Stopping search.`);
			break; // Stop searching if mate is found
		}
	}

	const totalTime = performance.now() - startTime;
	console.debug(`[Engine] Search finished. Final best move: ${JSON.stringify(bestMoveOverall)}. Depth reached: ${lastCompletedDepth}. Total time: ${totalTime.toFixed(0)}ms`);
	return bestMoveOverall;
}