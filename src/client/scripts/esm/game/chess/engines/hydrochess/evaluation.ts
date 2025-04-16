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
	[rawTypes.BISHOP]: 450,
	[rawTypes.ROOK]: 700,
	[rawTypes.QUEEN]: 1200,
	[rawTypes.KING]: 20000, 
};

const DEVELOPMENT_BONUS = 6;
const CENTRALITY_BONUS = 5;
const BACK_RANK_BONUS = 25;

// Distance bonuses for different pieces
const QUEEN_KNIGHT_PROXIMITY_BONUS = 30; // Max bonus for queens/knights being close to opponent king

// Pawn advancement bonuses
const PAWN_RANK_BONUS = 10; // Points per rank advanced
const PASSED_PAWN_RANK_BONUS = 25; // Points per rank for passed pawns

// King safety bonus
const PAWN_SHIELD_BONUS = 20; // Points per pawn adjacent to king

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
 * @param tt_best_move Optional - best move from the transposition table.
 * @returns A score for the move.
 */
function scoreMove(move: MoveDraft, lf: gamefile, data: SearchData, pv_table: (MoveDraft | null | undefined)[][], killer_moves: Array<Array<MoveDraft | null>>, history_table: Map<string, number>, tt_best_move?: MoveDraft | null): number {
	// PV move gets highest priority
	if (data.ply === 0 && data.score_pv && helpers.movesAreEqual(move, pv_table[0]![data.ply])) {
		data.score_pv = false;
		return 20000; // highest priority
	}
	// TT best move gets second highest priority
	if (tt_best_move && helpers.movesAreEqual(move, tt_best_move)) {
		return 16000; // second highest priority
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
 * Evaluates the current position from white's perspective.
 * Calculates scores for both white and black pieces separately, then returns the difference.
 * All evaluations are done in absolute terms for each side, not relative to current player.
 * @param lf The logical gamefile state.
 * @returns The evaluation score from white's perspective (positive is good for white, negative is good for black).
 */
function evaluate(lf: gamefile): number {
	let score = 0;
	const pieces: OrganizedPieces = lf.pieces;
	const allPieceCoords = boardutil.getCoordsOfAllPieces(pieces);

	// King coordinates for both sides
	let whiteKingCoords: Coords | undefined = undefined;
	let blackKingCoords: Coords | undefined = undefined;

	// Find Kings first
	for (const [type, range] of pieces.typeRanges) {
		if (typeutil.getRawType(type) === rawTypes.KING) {
			for (let idx = range.start; idx < range.end; idx++) {
				if (boardutil.isIdxUndefinedPiece(pieces, idx)) continue;
				const coords = boardutil.getCoordsFromIdx(pieces, idx);
				if (typeutil.getColorFromType(type) === players.WHITE) {
					whiteKingCoords = coords;
				} else {
					blackKingCoords = coords;
				}
			}
			if (whiteKingCoords && blackKingCoords) break; 
		}
	}

	// Initialize pawn coordinate arrays for both colors
	const whitePawnCoords: Coords[] = [];
	const blackPawnCoords: Coords[] = [];

	// --- Evaluate Pieces --- 
	// Track piece positions by type and color
	const whitePieceCoords: Map<number, Coords[]> = new Map();
	const blackPieceCoords: Map<number, Coords[]> = new Map();

	for (const coords of allPieceCoords) {
		const piece = boardutil.getPieceFromCoords(pieces, coords);
		if (!piece) continue;

		const pieceRawType = typeutil.getRawType(piece.type);
		const pieceValue = PIECE_VALUES[pieceRawType] || 0;
		const pieceColor = typeutil.getColorFromType(piece.type);

		let pieceScore = 0;

		// Track pieces by type and color for later evaluations
		if (pieceColor === players.WHITE) {
			if (!whitePieceCoords.has(pieceRawType)) {
				whitePieceCoords.set(pieceRawType, []);
			}
			whitePieceCoords.get(pieceRawType)!.push(coords);
			
			if (pieceRawType === rawTypes.PAWN) {
				whitePawnCoords.push(coords);
			}
		} else {
			if (!blackPieceCoords.has(pieceRawType)) {
				blackPieceCoords.set(pieceRawType, []);
			}
			blackPieceCoords.get(pieceRawType)!.push(coords);
			
			if (pieceRawType === rawTypes.PAWN) {
				blackPawnCoords.push(coords);
			}
		}

		// 1. Material Value
		pieceScore += pieceValue;

		// 2. Development Bonus (simple version: not on starting rank for non-pawns/kings)
		if (pieceRawType !== rawTypes.PAWN && pieceRawType !== rawTypes.KING) {
			const startingRank = (pieceColor === players.WHITE) ? 1 : 8;
			if (coords[1] !== startingRank) {
				pieceScore += DEVELOPMENT_BONUS;
			}
		}

		// 3. Centrality Bonus (closer to center) - Apply only to Knights
		if (pieceRawType === rawTypes.KNIGHT) {
			// Assuming a 10x10 board, center is roughly (4.5, 4.5)
			const distToCenter = Math.sqrt(Math.pow(coords[0] - 4.5, 2) + Math.pow(coords[1] - 4.5, 2));
			// Bonus inversely proportional to distance (max bonus at center, 0 at corners)
			pieceScore += Math.max(0, CENTRALITY_BONUS * (1 - distToCenter / Math.sqrt(2 * 4.5 * 4.5)));
		}

		// 4. Piece-specific evaluations
		// Calculate distance to opposite color king
		const oppositeKingCoords = pieceColor === players.WHITE ? blackKingCoords! : whiteKingCoords!;
		const distToOppositeKing = Math.sqrt(
			Math.pow(coords[0] - oppositeKingCoords[0], 2) + 
			Math.pow(coords[1] - oppositeKingCoords[1], 2)
		);

		// 4.1 Queen - prefers to be CLOSER to opponent king
		if (pieceRawType === rawTypes.QUEEN) {
			// Closer is better (but not too close - optimal around 2-3 squares)
			// Scale from 0 (far away) to QUEEN_KNIGHT_PROXIMITY_BONUS (close)
			const distanceScale = Math.max(0, 10 - distToOppositeKing) / 10;
			pieceScore += distanceScale * QUEEN_KNIGHT_PROXIMITY_BONUS;

			// Extra bonus for being on opponent's back rank
			const opponentBackRank = (pieceColor === players.WHITE) ? 8 : 1;
			if ((pieceColor === players.WHITE && coords[1] >= opponentBackRank) || 
				(pieceColor === players.BLACK && coords[1] <= opponentBackRank)) {
				pieceScore += BACK_RANK_BONUS;
			}
		}

		// 4.2 Knight - prefers to be closer to opponent king but not extreme
		else if (pieceRawType === rawTypes.KNIGHT) {
			// Closer is better but cap at moderate distance (optimal around 3-4 squares)
			const distanceScale = Math.max(0, 8 - distToOppositeKing) / 8;
			pieceScore += distanceScale * (QUEEN_KNIGHT_PROXIMITY_BONUS / 3); // Third of the queen
		}

		// 4.3 Pawn advancement (basic evaluation without passed pawn check yet)
		else if (pieceRawType === rawTypes.PAWN) {
			// Calculate pawn advancement
			const startRank = pieceColor === players.WHITE ? 2 : 7;
			
			// How many ranks has the pawn advanced?
			const ranksAdvanced = Math.abs(coords[1] - startRank);
			
			// For now, just give base advancement bonus - we'll check passed pawns separately
			pieceScore += ranksAdvanced * PAWN_RANK_BONUS;
		}
		
		// Add piece score to the appropriate color's total
		if (pieceColor === players.WHITE) {
			score += pieceScore;
		} else {
			score -= pieceScore;
		}
	}

	// 5. Passed pawn evaluation (now that we have all pawns collected)
	const isPassedPawn = (pawnCoords: Coords, opponentPawns: Coords[], pawnColor: Player): boolean => {
		const file = pawnCoords[0];
		
		for (const oppCoords of opponentPawns) {
			const oppFile = oppCoords[0];
			const oppRank = oppCoords[1];
			
			// Same or adjacent file
			if (Math.abs(oppFile - file) <= 1) {
				// Check if opponent pawn is ahead based on color
				if ((pawnColor === players.WHITE && oppRank > pawnCoords[1]) || 
					(pawnColor === players.BLACK && oppRank < pawnCoords[1])) {
					return false;
				}
			}
		}
		return true;
	};

	// Add bonus for white passed pawns
	for (const pawnCoord of whitePawnCoords) {
		const startRank = 2; // White pawns start on rank 2
		const ranksAdvanced = Math.abs(pawnCoord[1] - startRank);
		
		if (isPassedPawn(pawnCoord, blackPawnCoords, players.WHITE)) {
			score += ranksAdvanced * (PASSED_PAWN_RANK_BONUS - PAWN_RANK_BONUS);
		}
	}

	// Add bonus for black passed pawns
	for (const pawnCoord of blackPawnCoords) {
		const startRank = 7; // Black pawns start on rank 7
		const ranksAdvanced = Math.abs(pawnCoord[1] - startRank);
		
		if (isPassedPawn(pawnCoord, whitePawnCoords, players.BLACK)) {
			score -= ranksAdvanced * (PASSED_PAWN_RANK_BONUS - PAWN_RANK_BONUS);
		}
	}
	
	// 6. King Safety - Evaluate pawn shield
	const countAdjacentPawns = (kingCoords: Coords, pawnCoords: Coords[]): number => {
		let count = 0;
		for (const pawnCoord of pawnCoords) {
			// Check if pawn is adjacent to king (maximum distance of 1 in any direction)
			const distX = Math.abs(pawnCoord[0] - kingCoords[0]);
			const distY = Math.abs(pawnCoord[1] - kingCoords[1]);
			
			if (distX <= 1 && distY <= 1) {
				count++;
			}
		}
		return count;
	};

	// White king safety
	if (whiteKingCoords) {
		const pawnShieldCount = countAdjacentPawns(whiteKingCoords, whitePawnCoords);
		score += pawnShieldCount * PAWN_SHIELD_BONUS;
	}

	// Black king safety
	if (blackKingCoords) {
		const pawnShieldCount = countAdjacentPawns(blackKingCoords, blackPawnCoords);
		score -= pawnShieldCount * PAWN_SHIELD_BONUS;
	}

	return lf.whosTurn === players.WHITE ? score : -score;
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