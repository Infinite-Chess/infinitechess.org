// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { rawTypes } from "../../../../chess/util/typeutil.js"; 
import { players } from "../../../../chess/util/typeutil.js"; 
import type { Player } from "../../../../chess/util/typeutil.js"; 
import type { Coords } from "../../../../chess/util/coordutil.js";
import type { MoveDraft } from "../../../../chess/logic/movepiece.js"; 
import { OrganizedPieces } from "../../../../chess/logic/organizedpieces.js";
import helpers from "./helpers.js";

const PIECE_VALUES: { [key: number]: number } = {
	[rawTypes.PAWN]: 100,
	[rawTypes.KNIGHT]: 300,
	[rawTypes.BISHOP]: 400,
	[rawTypes.ROOK]: 500,
	[rawTypes.QUEEN]: 900,
	[rawTypes.KING]: 20000, 
};

const DEVELOPMENT_BONUS = 10;
const CENTRALITY_BONUS = 5;
const BACK_RANK_INFILTRATION_BONUS = 50;
const KING_PROXIMITY_BONUS_FACTOR = 5;

/**
 * Assigns scores to moves for ordering purposes.
 * Higher scores are searched first.
 * @param move The move to score.
 * @param lf The current game state.
 * @param ttBestMove The best move from the TT, if any.
 * @param pvMoveFromID The PV move from the previous iteration (only at root).
 * @param ply Current search depth from root.
 * @returns A score for the move.
 */
function scoreMove(move: MoveDraft, lf: gamefile, ttBestMove: MoveDraft | null, pvMoveFromID: MoveDraft | null, ply: number): number {
	// 1. PV Move (only at root)
	if (ply === 0 && pvMoveFromID && helpers.movesAreEqual(move, pvMoveFromID)) {
		return 10000; // Highest priority
	}
	// 2. TT Move
	if (ttBestMove && helpers.movesAreEqual(move, ttBestMove)) {
		return 9000;
	}
	// 3. Captures (MVV-LVA - Most Valuable Victim, Least Valuable Aggressor)
	const capturedPiece = boardutil.getPieceFromCoords(lf.pieces, move.endCoords);
	if (capturedPiece) {
		const movingPiece = boardutil.getPieceFromCoords(lf.pieces, move.startCoords);
		if (!movingPiece) return -1; // Should not happen
		const victimValue = PIECE_VALUES[typeutil.getRawType(capturedPiece.type)]!;
		const aggressorValue = PIECE_VALUES[typeutil.getRawType(movingPiece.type)]!;
		// Score: Base value + Victim Value - Aggressor Value (scaled down)
		return 8000 + (victimValue * 10 - aggressorValue);
	}
	// 4. Promotions (Queen)
	if (move.promotion) {
		const playerColor = typeutil.getColorFromType(move.promotion);
		if (playerColor !== null && move.promotion === typeutil.buildType(rawTypes.QUEEN, playerColor)) {
			return 7500;
		}
		// Other promotions (Knight usually) can have a lower score if desired
		return 7000;
	}
	// TODO: Add Killer Moves, History Heuristic
	// 5. Other moves (non-captures, non-promotions)
	return 0;
}

/**
 * Evaluates the current position for a given player.
 * Considers material, piece development, centrality, back-rank infiltration, and king proximity.
 * @param lf The logical gamefile state.
 * @param player The player for whom to evaluate the position.
 * @returns The evaluation score for the player's position.
 */
function evaluatePosition(lf: gamefile, player: Player): number {
	let score = 0;
	const pieces: OrganizedPieces = lf.pieces;
	const allPieceCoords = boardutil.getCoordsOfAllPieces(pieces);

	let playerKingCoords: Coords | undefined = undefined;
	let opponentKingCoords: Coords | undefined = undefined;

	// Find Kings first
	for (const [type, range] of pieces.typeRanges) {
		if (typeutil.getRawType(type) === rawTypes.KING) {
			for (let idx = range.start; idx < range.end; idx++) {
				if (boardutil.isIdxUndefinedPiece(pieces, idx)) continue;
				const coords = boardutil.getCoordsFromIdx(pieces, idx);
				if (typeutil.getColorFromType(type) === player) {
					playerKingCoords = coords;
				} else {
					opponentKingCoords = coords;
				}
			}
			if (playerKingCoords && opponentKingCoords) break; 
		}
	}

	// --- Evaluate Pieces --- 
	for (const coords of allPieceCoords) {
		const piece = boardutil.getPieceFromCoords(pieces, coords);
		if (!piece) continue;

		const pieceRawType = typeutil.getRawType(piece.type);
		const pieceValue = PIECE_VALUES[pieceRawType] || 0;
		const pieceColor = typeutil.getColorFromType(piece.type);

		let pieceScore = 0;

		// 1. Material Value
		pieceScore += pieceValue;

		// 2. Development Bonus (simple version: not on starting rank for non-pawns/kings)
		if (pieceRawType !== rawTypes.PAWN && pieceRawType !== rawTypes.KING) {
			const startingRank = (pieceColor === players.WHITE) ? 1 : 8;
			if (coords[1] !== startingRank) {
				pieceScore += DEVELOPMENT_BONUS;
			}
		}

		// 3. Centrality Bonus (closer to center) - Apply only to Pawns and Knights
		if (pieceRawType === rawTypes.PAWN || pieceRawType === rawTypes.KNIGHT) {
			// Assuming a 10x10 board, center is roughly (4.5, 4.5)
			const distToCenter = Math.sqrt(Math.pow(coords[0] - 4.5, 2) + Math.pow(coords[1] - 4.5, 2));
			// Bonus inversely proportional to distance (max bonus at center, 0 at corners)
			pieceScore += Math.max(0, CENTRALITY_BONUS * (1 - distToCenter / Math.sqrt(2 * 4.5 * 4.5)));
		}

		// 4. Back Rank Infiltration (Queens, Rooks, Bishops)
		if (pieceRawType === rawTypes.QUEEN || pieceRawType === rawTypes.ROOK || pieceRawType === rawTypes.BISHOP) {
			const opponentBackRankStart = (pieceColor === players.WHITE) ? 8 : 1;
			
			if (pieceColor === players.WHITE && coords[1] < opponentBackRankStart) {
				pieceScore += BACK_RANK_INFILTRATION_BONUS;
			} else if (pieceColor === players.BLACK && coords[1] > opponentBackRankStart) {
				pieceScore += BACK_RANK_INFILTRATION_BONUS;
			}
		}

		// 5. Proximity to Opponent King (Bonus for being closer) - Apply only to Pawns and Knights
		if ((pieceRawType === rawTypes.PAWN || pieceRawType === rawTypes.KNIGHT) && opponentKingCoords) {
			// Calculate Euclidean distance manually
			const distToOpponentKing = Math.sqrt(Math.pow(coords[0] - opponentKingCoords[0], 2) + Math.pow(coords[1] - opponentKingCoords[1], 2));
			// Max distance on 10x10 is sqrt(9^2 + 9^2) ~= 12.7
			// Bonus is higher when distance is smaller
			pieceScore += Math.max(0, KING_PROXIMITY_BONUS_FACTOR * (13 - distToOpponentKing));
		}
		
		// Add/Subtract piece score based on color
		if (pieceColor === player) {
			score += pieceScore;
		} else {
			score -= pieceScore;
		}
	}

	// TODO: Add other evaluation terms: King safety, pawn structure, passed pawns, piece coordination, etc.

	return score;
}

export default {
	evaluatePosition,
	scoreMove 
};