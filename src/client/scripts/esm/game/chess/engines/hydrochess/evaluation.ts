// @ts-nocheck
// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { rawTypes, Player, players } from "../../../../chess/util/typeutil.js"; 
import type { Coords } from "../../../../chess/util/coordutil.js";
import { MoveDraft, Move } from "../../../../chess/logic/movepiece.js"; 
import { OrganizedPieces } from "../../../../chess/logic/organizedpieces.js";
import helpers from "./helpers.js";
import { SearchData } from "./engine.js"; // Assuming MAX_DEPTH is exported
// import checkdetection, { Attacker } from "../../../../chess/logic/checkdetection.js";

/**
 * EvaluationState class to maintain the incremental evaluation state.
 * This tracks all components of the evaluation so they can be updated
 * incrementally as pieces move rather than recalculating from scratch.
 */
export class EvaluationState {
	// Base score components
	materialScore: number = 0;
	positionalScore: number = 0;
	pawnStructureScore: number = 0;
	kingSafetyScore: number = 0;
	
	// Tracking piece positions for efficient updates
	whitePieceCoords: Map<number, Coords[]> = new Map();
	blackPieceCoords: Map<number, Coords[]> = new Map();
	
	// King positions for quick access
	whiteKingCoords: Coords | undefined = undefined;
	blackKingCoords: Coords | undefined = undefined;
	
	// Pawn file tracking (index = file, value = count)
	whitePawnFiles: number[] = Array(16).fill(0);
	blackPawnFiles: number[] = Array(16).fill(0);
	
	constructor() {
		// Initialize piece coordinate arrays
		this.whitePieceCoords.set(rawTypes.PAWN, []);
		this.whitePieceCoords.set(rawTypes.KNIGHT, []);
		this.whitePieceCoords.set(rawTypes.BISHOP, []);
		this.whitePieceCoords.set(rawTypes.ROOK, []);
		this.whitePieceCoords.set(rawTypes.QUEEN, []);
		this.whitePieceCoords.set(rawTypes.KING, []);
		
		this.blackPieceCoords.set(rawTypes.PAWN, []);
		this.blackPieceCoords.set(rawTypes.KNIGHT, []);
		this.blackPieceCoords.set(rawTypes.BISHOP, []);
		this.blackPieceCoords.set(rawTypes.ROOK, []);
		this.blackPieceCoords.set(rawTypes.QUEEN, []);
		this.blackPieceCoords.set(rawTypes.KING, []);
	}
	
	/**
	 * Reset the evaluation state to prepare for a new position
	 */
	reset(): void {
		this.materialScore = 0;
		this.positionalScore = 0;
		this.pawnStructureScore = 0;
		this.kingSafetyScore = 0;
		
		this.whiteKingCoords = undefined;
		this.blackKingCoords = undefined;
		
		// Clear piece coordinates without reallocating arrays
		for (const pieceArrays of [this.whitePieceCoords, this.blackPieceCoords]) {
			for (const coordsArray of pieceArrays.values()) {
				coordsArray.length = 0;
			}
		}
		
		// Reset pawn file counts
		this.whitePawnFiles.fill(0);
		this.blackPawnFiles.fill(0);
	}
	
	/**
	 * Initialize the evaluation state from a board position
	 * This performs a full evaluation and stores all the intermediate values
	 * @param lf The logical gamefile state
	 */
	initFromPosition(lf: gamefile): void {
		// Start with a clean state
		this.reset();
		
		const pieces: OrganizedPieces = lf.pieces;
		const allPieceCoords = boardutil.getCoordsOfAllPieces(pieces);

		// First pass: collect piece information and calculate material score
		for (const coords of allPieceCoords) {
			const piece = boardutil.getPieceFromCoords(pieces, coords);
			if (!piece) continue;

			const pieceRawType = typeutil.getRawType(piece.type);
			const pieceValue = PIECE_VALUES[pieceRawType] ?? 0;
			const pieceColor = typeutil.getColorFromType(piece.type);
			
			// Track the piece position by type and color
			if (pieceColor === players.WHITE) {
				const pieceArray = this.whitePieceCoords.get(pieceRawType);
				if (pieceArray) {
					pieceArray.push([...coords]); // Store a copy to avoid reference issues
				}
				
				// Track pawn files for white
				if (pieceRawType === rawTypes.PAWN && coords[0] >= 0 && coords[0] < 16) {
					this.whitePawnFiles[coords[0]]++;
				}
				
				// Store king position for white
				if (pieceRawType === rawTypes.KING) {
					this.whiteKingCoords = [...coords];
				}

				// Material score (positive for white)
				this.materialScore += pieceValue;
			} else {
				// Similar processing for black pieces
				const pieceArray = this.blackPieceCoords.get(pieceRawType);
				if (pieceArray) {
					pieceArray.push([...coords]);
				}

				// Track pawn files for black
				if (pieceRawType === rawTypes.PAWN && coords[0] >= 0 && coords[0] < 16) {
					this.blackPawnFiles[coords[0]]++;
				}
				
				// Store king position for black
				if (pieceRawType === rawTypes.KING) {
					this.blackKingCoords = [...coords];
				}

				// Material score (negative for black)
				this.materialScore -= pieceValue;
			}
		}

		// Second pass: calculate positional scores
		this.calculatePositionalScore();
		
		// Third pass: calculate pawn structure score
		this.calculatePawnStructureScore();
		
		// Fourth pass: calculate king safety score
		this.calculateKingSafetyScore();
	}
	
	/**
	 * Calculate positional scores for all pieces
	 * This includes piece development, centrality bonuses, etc.
	 */
	calculatePositionalScore(): void {
		this.positionalScore = 0;
		
		// Process white pieces
		this.positionalScore += this.calculateSidePositionalScore(this.whitePieceCoords, players.WHITE);
		
		// Process black pieces (negate score)
		this.positionalScore -= this.calculateSidePositionalScore(this.blackPieceCoords, players.BLACK);
	}
	
	/**
	 * Calculate positional score for one side
	 * @param pieceCoords Map of piece types to their coordinates
	 * @param side The side (WHITE or BLACK)
	 * @returns The raw positional score (positive is good for the given side)
	 */
	private calculateSidePositionalScore(pieceCoords: Map<number, Coords[]>, side: Player): number {
		let score = 0;
		
		// Process knights - centrality bonus
		const knights = pieceCoords.get(rawTypes.KNIGHT) || [];
		for (const coords of knights) {
			// Centrality bonus - closer to center is better
			const distToCenter = Math.sqrt(Math.pow(coords[0] - 4.5, 2) + Math.pow(coords[1] - 4.5, 2));
			// Max bonus at center, 0 at corners
			score += Math.max(0, CENTRALITY_BONUS * (1 - distToCenter / Math.sqrt(2 * 4.5 * 4.5)));
		}
		
		// Process rooks - open and semi-open file bonuses
		const rooks = pieceCoords.get(rawTypes.ROOK) || [];
		for (const coords of rooks) {
			const rookFile = coords[0];
			const ownPawnFiles = side === players.WHITE ? this.whitePawnFiles : this.blackPawnFiles;
			const enemyPawnFiles = side === players.WHITE ? this.blackPawnFiles : this.whitePawnFiles;
			
			// Check if file is within bounds
			if (rookFile >= 0 && rookFile < 16) {
				const ownPawnsOnFile = ownPawnFiles[rookFile];
				const enemyPawnsOnFile = enemyPawnFiles[rookFile];
				
				// Open file bonus (no pawns on file)
				if (ownPawnsOnFile === 0 && enemyPawnsOnFile === 0) {
					score += 25;
				}
				// Semi-open file bonus (no own pawns but enemy pawns)
				else if (ownPawnsOnFile === 0) {
					score += 10;
				}
			}
		}
		
		// Development bonus for non-pawns, non-kings
		for (const [pieceType, coordsList] of pieceCoords.entries()) {
			if (pieceType !== rawTypes.PAWN && pieceType !== rawTypes.KING) {
				for (const coords of coordsList) {
					const startingRank = (side === players.WHITE) ? 1 : 8;
					if (coords[1] !== startingRank) {
						score += DEVELOPMENT_BONUS;
					}
				}
			}
		}
		
		return score;
	}
	
	/**
	 * Calculate pawn structure score
	 */
	calculatePawnStructureScore(): void {
		this.pawnStructureScore = 0;
		
		// Get pawn coordinates
		const whitePawns = this.whitePieceCoords.get(rawTypes.PAWN) || [];
		const blackPawns = this.blackPieceCoords.get(rawTypes.PAWN) || [];
		
		// Calculate white pawn advancement bonuses and passed pawns
		for (const pawnCoord of whitePawns) {
			const [file, rank] = pawnCoord;
			
			// Pawn advancement bonus
			this.pawnStructureScore += (rank - 1) * PAWN_RANK_BONUS;
			
			// Check if this is a passed pawn
			if (!this.isPawnBlocked(file, rank, blackPawns, true)) {
				this.pawnStructureScore += PASSED_PAWN_RANK_BONUS[rank] ?? 0;
			}
		}
		
		// Calculate black pawn advancement bonuses and passed pawns
		for (const pawnCoord of blackPawns) {
			const [file, rank] = pawnCoord;
			
			// Black pawns get higher scores for advancing toward the first rank
			this.pawnStructureScore -= (8 - rank) * PAWN_RANK_BONUS;
			
			// Check if this is a passed pawn
			if (!this.isPawnBlocked(file, rank, whitePawns, false)) {
				this.pawnStructureScore -= PASSED_PAWN_RANK_BONUS[9 - rank] ?? 0;
			}
		}
		
		// Penalize doubled pawns
		for (let file = 0; file < 16; file++) {
			const whitePawnsOnFile = this.whitePawnFiles[file];
			if (whitePawnsOnFile > 1) {
				this.pawnStructureScore -= (whitePawnsOnFile - 1) * 15;
			}
			
			const blackPawnsOnFile = this.blackPawnFiles[file];
			if (blackPawnsOnFile > 1) {
				this.pawnStructureScore += (blackPawnsOnFile - 1) * 15;
			}
		}
	}
	
	/**
	 * Check if a pawn is blocked from advancing by enemy pawns
	 */
	private isPawnBlocked(file: number, rank: number, opposingPawnCoords: Coords[], isWhitePawn: boolean): boolean {
		// Check files within bounds to prevent array access issues
		for (let f = Math.max(0, file - 1); f <= Math.min(15, file + 1); f++) {
			// Check if there are any opposing pawns on this file that are ahead
			for (const opposingPawnCoord of opposingPawnCoords) {
				const [oFile, oRank] = opposingPawnCoord;
				if (oFile === f) {
					if (isWhitePawn && oRank > rank) { // Black pawn ahead of white pawn
						return true; // Blocked
					}
					if (!isWhitePawn && oRank < rank) { // White pawn ahead of black pawn
						return true; // Blocked
					}
				}
			}
		}
		return false; // Not blocked
	}
	
	/**
	 * Calculate king safety score based on pawns and pieces near the king
	 */
	calculateKingSafetyScore(): void {
		this.kingSafetyScore = 0;
		
		// Skip if either king is missing
		if (!this.whiteKingCoords || !this.blackKingCoords) {
			return;
		}
		
		// White king safety - pawns near king provide protection
		const whitePawns = this.whitePieceCoords.get(rawTypes.PAWN) || [];
		let whitePawnsNearKing = 0;
		for (const pawnCoord of whitePawns) {
			if (Math.abs(pawnCoord[0] - this.whiteKingCoords[0]) <= 1 && 
				Math.abs(pawnCoord[1] - this.whiteKingCoords[1]) <= 1) {
				whitePawnsNearKing++;
			}
		}
		this.kingSafetyScore += whitePawnsNearKing * PAWN_SHIELD_BONUS;
		
		// Black king safety
		const blackPawns = this.blackPieceCoords.get(rawTypes.PAWN) || [];
		let blackPawnsNearKing = 0;
		for (const pawnCoord of blackPawns) {
			if (Math.abs(pawnCoord[0] - this.blackKingCoords[0]) <= 1 && 
				Math.abs(pawnCoord[1] - this.blackKingCoords[1]) <= 1) {
				blackPawnsNearKing++;
			}
		}
		this.kingSafetyScore -= blackPawnsNearKing * PAWN_SHIELD_BONUS;
		
		// Attacking the opponent's king
		// White pieces threatening black king
		const whiteQueens = this.whitePieceCoords.get(rawTypes.QUEEN) || [];
		const whiteKnights = this.whitePieceCoords.get(rawTypes.KNIGHT) || [];
		
		for (const queenCoord of whiteQueens) {
			const distance = Math.sqrt(Math.pow(queenCoord[0] - this.blackKingCoords[0], 2) + 
								  Math.pow(queenCoord[1] - this.blackKingCoords[1], 2));
			this.kingSafetyScore += Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 10));
		}
		
		for (const knightCoord of whiteKnights) {
			const distance = Math.sqrt(Math.pow(knightCoord[0] - this.blackKingCoords[0], 2) + 
								  Math.pow(knightCoord[1] - this.blackKingCoords[1], 2));
			this.kingSafetyScore += Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 8));
		}
		
		// Black pieces threatening white king
		const blackQueens = this.blackPieceCoords.get(rawTypes.QUEEN) || [];
		const blackKnights = this.blackPieceCoords.get(rawTypes.KNIGHT) || [];
		
		for (const queenCoord of blackQueens) {
			const distance = Math.sqrt(Math.pow(queenCoord[0] - this.whiteKingCoords[0], 2) + 
								  Math.pow(queenCoord[1] - this.whiteKingCoords[1], 2));
			this.kingSafetyScore -= Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 10));
		}
		
		for (const knightCoord of blackKnights) {
			const distance = Math.sqrt(Math.pow(knightCoord[0] - this.whiteKingCoords[0], 2) + 
								  Math.pow(knightCoord[1] - this.whiteKingCoords[1], 2));
			this.kingSafetyScore -= Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 8));
		}
	}
	
	/**
	 * Update evaluation when a piece moves
	 * @param lf The current game state
	 * @param move The move being made
	 * @param isUndo Whether this is undoing a move
	 */
	updateIncrementally(lf: gamefile, move: Move, isUndo: boolean = false): void {
		// For simplicity in this first implementation, we'll just do a full recalculation
		// In a more optimized version, we'd only update the affected components
		this.initFromPosition(lf);
	}
	
	// Helper method to get the total score
	getTotalScore(side: Player): number {
		const score = this.materialScore + this.positionalScore + 
					this.pawnStructureScore + this.kingSafetyScore;
		return side === players.WHITE ? score : -score;
	}
}

export const PIECE_VALUES: { [key: number]: number } = {
	[rawTypes.PAWN]: 100,
	[rawTypes.KNIGHT]: 300,
	[rawTypes.BISHOP]: 450,
	[rawTypes.ROOK]: 650,
	[rawTypes.QUEEN]: 1400,
	[rawTypes.KING]: 20000
};

const DEVELOPMENT_BONUS = 6;
const CENTRALITY_BONUS = 5;
const BACK_RANK_BONUS = 25;

// Distance bonuses for different pieces
const QUEEN_KNIGHT_PROXIMITY_BONUS = 30; // Max bonus for queens/knights being close to opponent king

// Pawn advancement bonuses
const PAWN_RANK_BONUS = 10; // Points per rank advanced
const PASSED_PAWN_RANK_BONUS = [0, 25, 50, 75, 100, 125, 150, 175, 200]; // Points per rank for passed pawns

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

// Constants for new move ordering scores
const COUNTERMOVE_BONUS = 2000; // Bonus for moves that are counter moves
const CONTINUATION_BONUS = 1500; // Bonus for moves that have good continuation history

// Export this function so it can be used by the engine
export function getHistoryKey(pieceType: number, endCoords: Coords): string {
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
 * @param counter_moves The counter moves table.
 * @param continuation_history The continuation history table.
 * @returns A score for the move.
 */
function scoreMove(
	move: MoveDraft, 
	lf: gamefile, 
	data: SearchData, 
	pv_table: (MoveDraft | null | undefined)[][], 
	killer_moves: Array<Array<MoveDraft | null>>, 
	history_table: Map<string, number>, 
	tt_best_move?: MoveDraft | null,
	counter_moves?: Map<string, Move | null>,
	continuation_history?: Map<string, Map<string, number>>
): number {
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
	const pieceType = typeutil.getRawType(movedPiece);
	const captured = boardutil.getTypeFromCoords(lf.pieces, move.endCoords);
	
	// Check if this move is a countermove to the previous move
	if (counter_moves && data.previousMove) {
		const prevMoveKey = data.previousMove.type ? 
			`${data.previousMove.type}_${data.previousMove.startCoords[0]},${data.previousMove.startCoords[1]}_${data.previousMove.endCoords[0]},${data.previousMove.endCoords[1]}` : 
			"";
		
		const counterMove = counter_moves.get(prevMoveKey);
		if (counterMove && helpers.movesAreEqual(move, counterMove)) {
			score += COUNTERMOVE_BONUS;
		}
	}
	
	// Check continuation history
	if (continuation_history && data.previousMove && boardutil.getTypeFromCoords(lf.pieces, data.previousMove.startCoords)) {
		const pieceSquareKey = `${pieceType}_${move.endCoords[0]},${move.endCoords[1]}`;
		const prevPieceType = boardutil.getTypeFromCoords(lf.pieces, data.previousMove.startCoords)!;
		const prevSquareKey = `${prevPieceType}_${data.previousMove.endCoords[0]},${data.previousMove.endCoords[1]}`;
		
		if (continuation_history.has(pieceSquareKey)) {
			const contTable = continuation_history.get(pieceSquareKey)!;
			if (contTable.has(prevSquareKey)) {
				score += Math.min(CONTINUATION_BONUS, contTable.get(prevSquareKey)! / 10);
			}
		}
	}

	if (move.enpassant || captured !== undefined) {
		score += 8000;
		if (move.enpassant) {
			return score;
		} if (promoted) {
			return score + 2000 + PIECE_VALUES[typeutil.getRawType(promoted)]!;
		}

		// Ensure the captured piece type has a valid index
		const capturedTypeIndex = RAW_TO_INDEX[typeutil.getRawType(captured!)] ?? 0; // Default to index 0 if undefined
		// Ensure the attacker piece type has a valid index (should generally be true)
		const attackerTypeIndex = RAW_TO_INDEX[pieceType] ?? 0; 
		
		// Access MVV_LVA safely, defaulting score addition to 0 if indices are out of bounds or tables are missing
		const mvvLvaScore = MVV_LVA[attackerTypeIndex]?.[capturedTypeIndex] ?? 0;

		return score + mvvLvaScore;
	} else {
		if (killer_moves[0]![data.ply] && helpers.movesAreEqual(move, killer_moves[0]![data.ply])) {
			score += 4000;
		} else if (killer_moves[1]![data.ply] && helpers.movesAreEqual(move, killer_moves[1]![data.ply])) {
			score += 2000;
		} else {
			score += (history_table.get(getHistoryKey(pieceType, move.endCoords)) ?? 0);
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

	// Pre-allocate arrays with reasonable capacity for piece positions
	// This avoids repeated array resizing during evaluation
	const whitePawnCoords: Coords[] = [];
	const blackPawnCoords: Coords[] = [];

	// Use Map objects with pre-initialized capacity estimates
	const whitePieceCoords = new Map<number, Coords[]>();
	const blackPieceCoords = new Map<number, Coords[]>();
	
	// Initialize maps for piece types we know we'll use
	// Pre-allocate arrays for common piece types to avoid resizing during evaluation
	whitePieceCoords.set(rawTypes.PAWN, whitePawnCoords);
	whitePieceCoords.set(rawTypes.KNIGHT, []);
	whitePieceCoords.set(rawTypes.BISHOP, []);
	whitePieceCoords.set(rawTypes.ROOK, []);
	whitePieceCoords.set(rawTypes.QUEEN, []);
	whitePieceCoords.set(rawTypes.KING, []);
	
	blackPieceCoords.set(rawTypes.PAWN, blackPawnCoords);
	blackPieceCoords.set(rawTypes.KNIGHT, []);
	blackPieceCoords.set(rawTypes.BISHOP, []);
	blackPieceCoords.set(rawTypes.ROOK, []);
	blackPieceCoords.set(rawTypes.QUEEN, []);
	blackPieceCoords.set(rawTypes.KING, []);

	// Find Kings first
	for (const [type, range] of pieces.typeRanges) {
		if (typeutil.getRawType(type) === rawTypes.KING) {
			for (let idx = range.start; idx < range.end; idx++) {
				if (boardutil.isIdxUndefinedPiece(pieces, idx)) continue;
				const coords = boardutil.getCoordsFromIdx(pieces, idx);
				if (typeutil.getColorFromType(type) === players.WHITE) {
					whiteKingCoords = coords;
					whitePieceCoords.get(rawTypes.KING)!.push(coords);
				} else {
					blackKingCoords = coords;
					blackPieceCoords.get(rawTypes.KING)!.push(coords);
				}
			}
			if (whiteKingCoords && blackKingCoords) break; 
		}
	}

	// --- Evaluate Pieces --- 
	// Use a single loop to categorize pieces, which reduces allocations
	for (const coords of allPieceCoords) {
		const piece = boardutil.getPieceFromCoords(pieces, coords);
		if (!piece) continue;

		const pieceRawType = typeutil.getRawType(piece.type);
		const pieceValue = PIECE_VALUES[pieceRawType] ?? 0;
		const pieceColor = typeutil.getColorFromType(piece.type);

		let pieceScore = 0;

		// Track pieces by type and color for later evaluations - reuse existing arrays
		if (pieceColor === players.WHITE) {
			const pieceArray = whitePieceCoords.get(pieceRawType);
			if (pieceArray) {
				pieceArray.push(coords);
			}
		} else {
			const pieceArray = blackPieceCoords.get(pieceRawType);
			if (pieceArray) {
				pieceArray.push(coords);
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

		// 4. Rook on open and semi-open files (simplified version)
		if (pieceRawType === rawTypes.ROOK) {
			let pawnsOnFile = 0;
			const rookFile = coords[0];
			
			// Use stack arrays with pre-defined lengths for temporary work
			const pawnsToCheck = pieceColor === players.WHITE ? blackPawnCoords : whitePawnCoords;
			
			// Count pawns on this file
			for (let i = 0; i < pawnsToCheck.length; i++) {
				if (pawnsToCheck[i] && pawnsToCheck[i]![0] === rookFile) {
					pawnsOnFile++;
				}
			}
			
			// Bonuses for open and semi-open files
			if (pawnsOnFile === 0) {
				pieceScore += 25; // Open file bonus
			} else if (pawnsOnFile === 1) {
				pieceScore += 10; // Semi-open file bonus
			}
		}

		// Apply the piece score to the overall evaluation, considering color
		score += (pieceColor === players.WHITE) ? pieceScore : -pieceScore;
	}

	// --- Pawn Structure Evaluation --- 
	// Use the previously collected pawn coords for both sides
	score += evaluatePawnStructure(whitePawnCoords, blackPawnCoords);

	// --- King Safety Evaluation ---
	if (whiteKingCoords && blackKingCoords) {
		// Stack-allocated tracking arrays for pawns near king
		const whitePawnsNearKing: Coords[] = [];
		const blackPawnsNearKing: Coords[] = [];
		
		// We already have all pawn coordinates categorized by color
		// Now find ones near the kings
		for (let i = 0; i < whitePawnCoords.length; i++) {
			const pawnCoord = whitePawnCoords[i];
			if (pawnCoord && Math.abs(pawnCoord[0] - whiteKingCoords![0]) <= 1 && 
			    Math.abs(pawnCoord[1] - whiteKingCoords![1]) <= 1) {
				whitePawnsNearKing.push(pawnCoord);
			}
		}
		
		for (let i = 0; i < blackPawnCoords.length; i++) {
			const pawnCoord = blackPawnCoords[i];
			if (pawnCoord && Math.abs(pawnCoord[0] - blackKingCoords![0]) <= 1 && 
			    Math.abs(pawnCoord[1] - blackKingCoords![1]) <= 1) {
				blackPawnsNearKing.push(pawnCoord);
			}
		}
		
		// Apply pawn shield bonuses
		score += whitePawnsNearKing.length * PAWN_SHIELD_BONUS;
		score -= blackPawnsNearKing.length * PAWN_SHIELD_BONUS;
		
		// Look for queens and knights near opponent king
		const whiteQueens = whitePieceCoords.get(rawTypes.QUEEN) ?? [];
		const whiteKnights = whitePieceCoords.get(rawTypes.KNIGHT) ?? [];
		const blackQueens = blackPieceCoords.get(rawTypes.QUEEN) ?? [];
		const blackKnights = blackPieceCoords.get(rawTypes.KNIGHT) ?? [];
		
		// Proximity-based attack bonuses using our pre-allocated arrays
		for (let i = 0; i < whiteQueens.length; i++) {
			const queenCoord = whiteQueens[i];
			if (queenCoord) {
				const distance = Math.sqrt(Math.pow(queenCoord[0] - blackKingCoords![0], 2) + 
				                      Math.pow(queenCoord[1] - blackKingCoords![1], 2));
				score += Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 10));
			}
		}
		
		for (let i = 0; i < whiteKnights.length; i++) {
			const knightCoord = whiteKnights[i];
			if (knightCoord) {
				const distance = Math.sqrt(Math.pow(knightCoord[0] - blackKingCoords![0], 2) + 
				                      Math.pow(knightCoord[1] - blackKingCoords![1], 2));
				score += Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 8));
			}
		}
		
		for (let i = 0; i < blackQueens.length; i++) {
			const queenCoord = blackQueens[i];
			if (queenCoord) {
				const distance = Math.sqrt(Math.pow(queenCoord[0] - whiteKingCoords![0], 2) + 
				                      Math.pow(queenCoord[1] - whiteKingCoords![1], 2));
				score -= Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 10));
			}
		}
		
		for (let i = 0; i < blackKnights.length; i++) {
			const knightCoord = blackKnights[i];
			if (knightCoord) {
				const distance = Math.sqrt(Math.pow(knightCoord[0] - whiteKingCoords![0], 2) + 
				                      Math.pow(knightCoord[1] - whiteKingCoords![1], 2));
				score -= Math.max(0, QUEEN_KNIGHT_PROXIMITY_BONUS * (1 - distance / 8));
			}
		}
	}

	// If it's black's turn, flip the sign to get the score from the current player's perspective
	return lf.whosTurn === players.WHITE ? score : -score;
}

// --- Helper Function for Passed Pawn Check ---
function isPawnBlocked(file: number, rank: number, opposingPawnCoords: (Coords | undefined)[], isWhitePawn: boolean): boolean {
	// Check files within bounds to prevent array access issues
	for (let f = Math.max(0, file - 1); f <= Math.min(15, file + 1); f++) {
		// Check if there are any opposing pawns on this file that are ahead
		for (let j = 0; j < opposingPawnCoords.length; j++) {
			const opposingPawnCoord = opposingPawnCoords[j]; // Get potential coord
			if (opposingPawnCoord) { // Check if it exists
				const [oFile, oRank] = opposingPawnCoord; // Safe destructuring
				if (oFile === f) {
					if (isWhitePawn && oRank > rank) { // Black pawn ahead of white pawn
						return true; // Blocked
					}
					if (!isWhitePawn && oRank < rank) { // White pawn ahead of black pawn
						return true; // Blocked
					}
				}
			}
		}
	}
	return false; // Not blocked
}

/**
 * Evaluates pawn structure for both sides
 * Optimized to use pre-allocated arrays and minimize allocations
 */
function evaluatePawnStructure(
	whitePawnCoords: (Coords | undefined)[], 
	blackPawnCoords: (Coords | undefined)[]
): number {
	let score = 0;

	// Stack arrays to avoid heap allocations in hot loops
	const whitePawnFiles: number[] = Array(16).fill(0);
	const blackPawnFiles: number[] = Array(16).fill(0);

	// Track passed pawns - check if a pawn has no enemy pawns ahead of it or on adjacent files
	// First, count pawns on each file
	for (let i = 0; i < whitePawnCoords.length; i++) {
		const pawnCoord = whitePawnCoords[i];
		if (pawnCoord) {
			const file = pawnCoord[0];
			// Files are limited to a reasonable range to prevent out-of-bounds access
			if (file >= 0 && file < 16) {
				whitePawnFiles[file] = (whitePawnFiles[file] ?? 0) + 1;
			}
		}
	}

	for (let i = 0; i < blackPawnCoords.length; i++) {
		const pawnCoord = blackPawnCoords[i];
		if (pawnCoord) {
			const file = pawnCoord[0];
			if (file >= 0 && file < 16) {
				blackPawnFiles[file] = (blackPawnFiles[file] ?? 0) + 1;
			}
		}
	}

	// Find passed pawns and calculate their value
	for (let i = 0; i < whitePawnCoords.length; i++) {
		const pawnCoord = whitePawnCoords[i];
		if (!pawnCoord) continue;
		const [file, rank] = pawnCoord;
		
		// Pawn advancement bonus - pawns further advanced get higher scores
		// This represents control of space and potential for promotion
		score += (rank - 1) * PAWN_RANK_BONUS;
		
		// Check if this is a passed pawn using the helper function
		if (!isPawnBlocked(file, rank, blackPawnCoords, true)) {
			score += PASSED_PAWN_RANK_BONUS[rank] ?? 0; // Use nullish coalescing for safety
		}
	}
	
	// Same for black pawns
	for (let i = 0; i < blackPawnCoords.length; i++) {
		const pawnCoord = blackPawnCoords[i];
		if (!pawnCoord) continue; // Skip if undefined
		const [file, rank] = pawnCoord; // Safe destructuring
		
		// Black pawns get higher scores for advancing toward the first rank
		score -= (8 - rank) * PAWN_RANK_BONUS;
		
		// Check if this is a passed pawn using the helper function
		if (!isPawnBlocked(file, rank, whitePawnCoords, false)) {
			score -= PASSED_PAWN_RANK_BONUS[9 - rank] ?? 0; // Rank reversed for black, use nullish coalescing
		}
	}

	// Detect and penalize doubled pawns
	for (let file = 0; file < 16; file++) {
		const whitePawnsOnFile = whitePawnFiles[file] ?? 0;
		if (whitePawnsOnFile > 1) {
			score -= (whitePawnsOnFile - 1) * 15; // Penalty for doubled pawns
		}
		const blackPawnsOnFile = blackPawnFiles[file] ?? 0;
		if (blackPawnsOnFile > 1) {
			score += (blackPawnsOnFile - 1) * 15; // Negative penalty for black (adds to white's score)
		}
	}

	return score;
}

// Export the evaluation functions
export default {
	evaluate,
	scoreMove,
	getHistoryKey
};