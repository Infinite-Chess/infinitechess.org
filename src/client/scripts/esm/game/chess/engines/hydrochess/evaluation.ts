// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { rawTypes, Player, players } from "../../../../chess/util/typeutil.js"; 
import type { Coords } from "../../../../chess/util/coordutil.js";
import { MoveDraft } from "../../../../chess/logic/movepiece.js"; 
import { OrganizedPieces } from "../../../../chess/logic/organizedpieces.js";
import helpers from "./helpers.js";
import { SearchData } from "../hydrochess.js"; // Assuming MAX_DEPTH is exported
// import checkdetection, { Attacker } from "../../../../chess/logic/checkdetection.js";

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
const KING_PROXIMITY_BONUS_FACTOR = 10;

const MVV_LVA: number[][] = [
	[105, 205, 305, 405, 505, 605,],
	[104, 204, 304, 404, 504, 604,],
	[103, 203, 303, 403, 503, 603,],
	[102, 202, 302, 402, 502, 602,],
	[101, 201, 301, 401, 501, 601,],
	[100, 200, 300, 400, 500, 600,],
];

const RAW_TO_INDEX: { [key: number]: number } = {
	[rawTypes.PAWN]: 0,
	[rawTypes.KNIGHT]: 1,
	[rawTypes.BISHOP]: 2,
	[rawTypes.ROOK]: 3,
	[rawTypes.QUEEN]: 4,
	[rawTypes.KING]: 5,
};

function getHistoryKey(pieceType: number, endCoords: Coords): string {
	// Simple key: piece type + target square coordinates
	return `${pieceType}-${endCoords[0]},${endCoords[1]}`;
}

/**
 * Assigns scores to moves for ordering purposes.
 * Higher scores are searched first.
 * @param move The move to score.
 * @param lf The current game state.
 * @param data Object containing search data (ply, score_pv).
 * @param pv_table The PV table for the current search.
 * @param killer_moves The killer moves table for the current search.
 * @param history_table The map storing history heuristic scores.
 * @returns A score for the move.
 */
function scoreMove(move: MoveDraft, lf: gamefile, data: SearchData, pv_table: (MoveDraft | null | undefined)[][], killer_moves: Array<Array<MoveDraft | null>>, history_table: Map<string, number>): number {
	if (data.ply === 0 && data.score_pv && helpers.movesAreEqual(move, pv_table[0]![data.ply])) {
		data.score_pv = false;
		return 16000; // Highest priority
	}
	
	let score = 0;
	const promoted = move.promotion;
	const movedPiece = boardutil.getTypeFromCoords(lf.pieces, move.startCoords)!;
	const captured = boardutil.getTypeFromCoords(lf.pieces, move.endCoords);

	if (move.enpassant || captured !== undefined) {
		score += 8000;
		if (move.enpassant) {
			return score;
		} if (promoted) {
			return score + 2000 + PIECE_VALUES[typeutil.getRawType(promoted)]!;
		}

		return score + MVV_LVA[RAW_TO_INDEX[typeutil.getRawType(movedPiece)]!]![RAW_TO_INDEX[typeutil.getRawType(captured!)]!]!;
	} else {
		if (helpers.movesAreEqual(move, killer_moves[0]![data.ply])) {
			score += 4000;
		} else if (helpers.movesAreEqual(move, killer_moves[1]![data.ply])) {
			score += 2500;
		} else {
			score += (history_table.get(getHistoryKey(typeutil.getRawType(movedPiece), move.endCoords)) || 0);
		}
	}

	if (promoted) {
		score += 9500 + PIECE_VALUES[typeutil.getRawType(promoted)]!;
	}

	return score;
}

/**
 * Evaluates the current position from the perspective of the player to move.
 * Considers material, piece development, centrality, back-rank infiltration, king proximity,
 * and piece safety to prevent hanging pieces.
 * @param lf The logical gamefile state.
 * @returns The evaluation score for the player's position.
 */
function evaluate(lf: gamefile): number {
	let score = 0;
	const pieces: OrganizedPieces = lf.pieces;
	const allPieceCoords = boardutil.getCoordsOfAllPieces(pieces);
	const currentPlayer = lf.whosTurn;

	let playerKingCoords: Coords | undefined = undefined;
	let opponentKingCoords: Coords | undefined = undefined;

	// Find Kings first
	for (const [type, range] of pieces.typeRanges) {
		if (typeutil.getRawType(type) === rawTypes.KING) {
			for (let idx = range.start; idx < range.end; idx++) {
				if (boardutil.isIdxUndefinedPiece(pieces, idx)) continue;
				const coords = boardutil.getCoordsFromIdx(pieces, idx);
				if (typeutil.getColorFromType(type) === currentPlayer) {
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
			
			if (pieceColor === players.WHITE && coords[1] >= opponentBackRankStart) {
				pieceScore += BACK_RANK_INFILTRATION_BONUS;
			} else if (pieceColor === players.BLACK && coords[1] <= opponentBackRankStart) {
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
		if (pieceColor === currentPlayer) {
			score += pieceScore;
		} else {
			score -= pieceScore;
		}
	}

	// TODO: Add other evaluation terms: King safety, pawn structure, passed pawns, piece coordination, etc.

	return score;
}

/**
 * Static Exchange Evaluation (SEE)
 * Estimates the net material gain/loss resulting from a sequence of captures on a specific square.
 * @param lf Game state
 * @param targetSquare The square where the capture sequence is initiated.
 * @param moveMakerColor The color of the player making the initial move.
 * @returns The estimated material gain (positive) or loss (negative) for the side initiating the capture.
 */
// function staticExchangeEvaluation(lf: gamefile, targetSquare: Coords, moveMakerColor: Player): number {
// 	const initialVictim = boardutil.getPieceFromCoords(lf.pieces, targetSquare);
// 	if (!initialVictim) {
// 		return 0; // Cannot perform SEE on an empty square
// 	}

// 	const gain: number[] = [];	
// 	const initialVictimValue = PIECE_VALUES[typeutil.getRawType(initialVictim.type)] ?? 0;
	
// 	// Get attackers for each color separately
// 	const whiteAttackersRaw: Attacker[] = [];
// 	checkdetection.isSquareBeingAttacked(lf, targetSquare, players.WHITE, whiteAttackersRaw);
// 	const blackAttackersRaw: Attacker[] = [];
// 	checkdetection.isSquareBeingAttacked(lf, targetSquare, players.BLACK, blackAttackersRaw);

// 	// Map attackers to { coords, value } and sort them by value (ascending)
// 	const mapAndSortAttackers = (attackers: Attacker[]): { coords: Coords, value: number }[] => {
// 		return attackers
// 			.map(attacker => {
// 				const piece = boardutil.getPieceFromCoords(lf.pieces, attacker.coords);
// 				// Assume piece is always found if isSquareBeingAttacked returned these coords
// 				const value = piece ? (PIECE_VALUES[typeutil.getRawType(piece.type)] ?? 0) : 0; 
// 				return { coords: attacker.coords, value };
// 			})
// 			.sort((a, b) => a.value - b.value);
// 	};

// 	const whiteAttackersSorted = mapAndSortAttackers(whiteAttackersRaw);
// 	const blackAttackersSorted = mapAndSortAttackers(blackAttackersRaw);
// 	let whiteIdx = 0;
// 	let blackIdx = 0;

// 	// Start with the side OPPOSITE to the piece being captured
// 	let attackerColor = typeutil.invertPlayer(typeutil.getColorFromType(initialVictim.type));
// 	let currentVictimValue = initialVictimValue;

// 	while (true) {
// 		let currentAttackerList;
// 		let currentIdx;

// 		if (attackerColor === players.WHITE) {
// 			currentAttackerList = whiteAttackersSorted;
// 			currentIdx = whiteIdx;
// 		} else {
// 			currentAttackerList = blackAttackersSorted;
// 			currentIdx = blackIdx;
// 		}

// 		if (currentIdx >= currentAttackerList.length) {
// 			break; // No more attackers of this color
// 		}

// 		// Least valuable attacker is at the current index in the sorted list
// 		const leastValuableAttackerInfo = currentAttackerList[currentIdx];

// 		// Increment the index for the next iteration for this color
// 		if (attackerColor === players.WHITE) {
// 			whiteIdx++;
// 		} else {
// 			blackIdx++;
// 		}

// 		// The current piece on the square is captured. Record its value.
// 		gain.push(currentVictimValue);

// 		// The piece that just captured is now the potential victim for the next capture
// 		currentVictimValue = leastValuableAttackerInfo!.value;

// 		// Switch sides for the next potential capture
// 		attackerColor = typeutil.invertPlayer(attackerColor);
// 	}

// 	// Calculate the final score from the gain list
// 	// The calculation works backward through the captures.
// 	// Start with score = 0. For each step i from end to start:
// 	// score = max(0, gain[i] - score)
// 	// This reflects whether keeping the current material state (score)
// 	// is better than making the capture (gain[i] - score).
// 	let score = 0;
// 	for (let i = gain.length - 1; i >= 0; i--) {
// 		score = Math.max(0, gain[i]! - score);
// 	}

// 	// The score calculated is from the perspective of the *first* attacker.
// 	// We need to adjust it based on who made the initial move (moveMakerColor).
// 	const firstAttackerColor = typeutil.invertPlayer(typeutil.getColorFromType(initialVictim.type));
// 	if (moveMakerColor !== firstAttackerColor) {
// 		score = -score; // Invert score if the move maker wasn't the first to capture
// 	}

// 	return score;
// }

// Export the evaluation functions
export default {
	evaluate,
	scoreMove,
	// staticExchangeEvaluation
};