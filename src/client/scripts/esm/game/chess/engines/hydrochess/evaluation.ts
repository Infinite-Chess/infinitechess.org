// @ts-nocheck
// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { rawTypes, Player, players } from "../../../../chess/util/typeutil.js"; 
import type { Coords } from "../../../../chess/util/coordutil.js";
import { MoveDraft, Move } from "../../../../chess/logic/movepiece.js"; 
import { OrganizedPieces } from "../../../../chess/logic/organizedpieces.js";
import helpers from "./helpers.js";
import { SearchData, evalState } from "./engine.js";
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
	
	// Fast O(1) occupancy lookup per color
	whitePieceSet: Set<string> = new Set(); // "x,y"
	blackPieceSet: Set<string> = new Set(); // "x,y"
	
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
		
		// Clear piece coordinates + sets without reallocating arrays
		for (const pieceArrays of [this.whitePieceCoords, this.blackPieceCoords]) {
			for (const coordsArray of pieceArrays.values()) {
				coordsArray.length = 0;
			}
		}
		this.whitePieceSet.clear();
		this.blackPieceSet.clear();
		
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
			const key = `${coords[0]},${coords[1]}`;
			
			// Track the piece position by type and color
			if (pieceColor === players.WHITE) {
				const pieceArray = this.whitePieceCoords.get(pieceRawType);
				if (pieceArray) {
					pieceArray.push([coords[0], coords[1]]); // Store coords directly without spread operator
				}
				
				// Track pawn files for white
				if (pieceRawType === rawTypes.PAWN && coords[0] >= 0 && coords[0] < 16) {
					this.whitePawnFiles[coords[0]]++;
				}
				
				// Store king position for white
				if (pieceRawType === rawTypes.KING) {
					this.whiteKingCoords = [coords[0], coords[1]];
				}

				// Material score (positive for white)
				this.materialScore += pieceValue;
				this.whitePieceSet.add(key);
			} else {
				// Similar processing for black pieces
				const pieceArray = this.blackPieceCoords.get(pieceRawType);
				if (pieceArray) {
					pieceArray.push([coords[0], coords[1]]);
				}

				// Track pawn files for black
				if (pieceRawType === rawTypes.PAWN && coords[0] >= 0 && coords[0] < 16) {
					this.blackPawnFiles[coords[0]]++;
				}
				
				// Store king position for black
				if (pieceRawType === rawTypes.KING) {
					this.blackKingCoords = [coords[0], coords[1]];
				}

				// Material score (negative for black)
				this.materialScore -= pieceValue;
				this.blackPieceSet.add(key);
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
				// Access coordinates directly without destructuring
				const oFile = opposingPawnCoord[0];
				const oRank = opposingPawnCoord[1];
				
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
}

export const PIECE_VALUES: { [key: number]: number } = {
	[rawTypes.PAWN]: 100,
	[rawTypes.KNIGHT]: 300,
	[rawTypes.BISHOP]: 450,
	[rawTypes.ROOK]: 650,
	[rawTypes.QUEEN]: 1400,
};

const DEVELOPMENT_BONUS = 6;
const CENTRALITY_BONUS = 5;
// Bonus for pieces controlling the back rank
const BACK_RANK_CONTROL = 25;

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
	if (data.ply === 0 && data.score_pv && helpers.movesAreEqual(move, pv_table[0]![0])) {
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
 * @param lf The logical gamefile state.
 * @returns The evaluation score from white's perspective (positive is good for white, negative is good for black).
 */
function evaluate(lf: gamefile): number {
	// Get king coordinates from the cached state
	const whiteKingCoords = evalState.whiteKingCoords;
	const blackKingCoords = evalState.blackKingCoords;
	
	// Use the cached piece coordinate maps to avoid recomputing
	const whitePieceCoords = evalState.whitePieceCoords;
	const blackPieceCoords = evalState.blackPieceCoords;
	
	// If this is our first evaluation or our incremental state isn't initialized,
	// initialize it from the current position
	if (!whiteKingCoords || !blackKingCoords || !whitePieceCoords.size || !blackPieceCoords.size) {
		evalState.initFromPosition(lf);
	}
	
	// Create a composite score using all evaluation components
	let score = evalState.materialScore + evalState.positionalScore;

	// --- Additional Evaluation Components --- 
	// Calculate pawn structure score 
	const pawnStructureScore = evaluatePawnStructure(
		whitePieceCoords.get(rawTypes.PAWN) || [],
		blackPieceCoords.get(rawTypes.PAWN) || []
	);
	score += pawnStructureScore;
	
	// Calculate king safety
	if (whiteKingCoords && blackKingCoords) {
		// Apply king safety evaluation
		const whiteKingSafety = evaluateKingSafety(true, whiteKingCoords, whitePieceCoords);
		const blackKingSafety = evaluateKingSafety(false, blackKingCoords, blackPieceCoords);
		score += whiteKingSafety - blackKingSafety;
		
		// Cache these calculated values for potential future use
		evalState.pawnStructureScore = pawnStructureScore;
		evalState.kingSafetyScore = whiteKingSafety - blackKingSafety;
	}

	// If it's black's turn, flip the sign
	if (lf.whosTurn === players.BLACK) {
		score = -score;
	}
	return score;
}

/**
 * Simplified king safety evaluation - checks only immediate surroundings
 * @param isWhite Whether evaluating white king safety
 * @param kingCoords King coordinates
 * @param pieceCoords Map of piece coordinates by type
 * @returns King safety score
 */
function evaluateKingSafety(isWhite: boolean, kingCoords: Coords, pieceCoords: Map<number, Coords[]>): number {
	let safety = 0;
	const [kx, ky] = kingCoords;
	
	// Check for pawns directly around the king (+20 for each)
	const pawns = pieceCoords.get(rawTypes.PAWN) || [];
	for (const [px, py] of pawns) {
		// Only consider pawns in the immediate vicinity (1 square away)
		if (Math.abs(px - kx) <= 1 && Math.abs(py - ky) <= 1) {
			safety += 20;
		}
	}
	
	// Bonus for knights and bishops near the king (quick defense)
	const minorPieces = [
		...(pieceCoords.get(rawTypes.KNIGHT) || []),
		...(pieceCoords.get(rawTypes.BISHOP) || [])
	];
	
	for (const [px, py] of minorPieces) {
		if (Math.abs(px - kx) <= 2 && Math.abs(py - ky) <= 2) {
			safety += 10;
		}
	}
	
	return safety;
}

/**
 * Simplified pawn structure evaluation for both sides
 * @param whitePawnCoords Array of white pawn coordinates
 * @param blackPawnCoords Array of black pawn coordinates
 * @returns Score for pawn structure (positive for white advantage)
 */
function evaluatePawnStructure(
	whitePawnCoords: Coords[], 
	blackPawnCoords: Coords[]
): number {
	let score = 0;

	// Pre-compute black pawn file positions for faster lookups
	const blackPawnsByFile = new Map<number, number[]>();
	const whitePawnsByFile = new Map<number, number[]>();
	const whitePawnCount = new Map<number, number>();
	const blackPawnCount = new Map<number, number>();

	// Initialize file tracking for white pawns
	for (const [px, py] of whitePawnCoords) {
		// Count pawns per file for doubled pawn detection
		whitePawnCount.set(px, (whitePawnCount.get(px) || 0) + 1);
		
		// Track ranks of pawns on each file
		if (!whitePawnsByFile.has(px)) {
			whitePawnsByFile.set(px, []);
		}
		whitePawnsByFile.get(px)!.push(py);
		
		// Simple advancement bonus
		score += (py - 1) * PAWN_RANK_BONUS;
	}

	// Initialize file tracking for black pawns
	for (const [px, py] of blackPawnCoords) {
		// Count pawns per file for doubled pawn detection
		blackPawnCount.set(px, (blackPawnCount.get(px) || 0) + 1);
		
		// Track ranks of pawns on each file
		if (!blackPawnsByFile.has(px)) {
			blackPawnsByFile.set(px, []);
		}
		blackPawnsByFile.get(px)!.push(py);
		
		// Simple advancement bonus for black (negative for white's perspective)
		score -= (8 - py) * PAWN_RANK_BONUS;
	}

	// Detect passed pawns for white (simplified heuristic)
	for (const [px, py] of whitePawnCoords) {
		// Check if pawn is potentially passed
		let isPassed = true;
		
		// Check three files (current and adjacent) for black pawns ahead
		outerLoop: for (let f = Math.max(0, px - 1); f <= px + 1 && isPassed; f++) {
			const blackRanksOnFile = blackPawnsByFile.get(f);
			if (!blackRanksOnFile) continue;
			
			// Check if any black pawn is ahead of this white pawn
			for (const blackRank of blackRanksOnFile) {
				if (blackRank > py) {
					isPassed = false;
					break outerLoop;
				}
			}
		}
		
		if (isPassed) {
			score += PASSED_PAWN_RANK_BONUS[py] || 0;
		}
	}

	// Detect passed pawns for black (simplified)
	for (const [px, py] of blackPawnCoords) {
		// Check if pawn is potentially passed
		let isPassed = true;
		
		// Check three files (current and adjacent) for white pawns ahead
		outerLoop: for (let f = Math.max(0, px - 1); f <= px + 1 && isPassed; f++) {
			const whiteRanksOnFile = whitePawnsByFile.get(f);
			if (!whiteRanksOnFile) continue;
			
			// Check if any white pawn is ahead of this black pawn
			for (const whiteRank of whiteRanksOnFile) {
				if (whiteRank < py) {
					isPassed = false;
					break outerLoop;
				}
			}
		}
		
		if (isPassed) {
			score -= PASSED_PAWN_RANK_BONUS[9 - py] || 0;
		}
	}

	// Penalty for doubled pawns (both sides)
	for (const [file, count] of whitePawnCount.entries()) {
		if (count > 1) {
			score -= (count - 1) * 15; // Penalty for doubled pawns
		}
	}
	
	for (const [file, count] of blackPawnCount.entries()) {
		if (count > 1) {
			score += (count - 1) * 15; // Negative penalty for black (adds to white's score)
		}
	}
	
	return score;
}

export default {
	evaluate,
	evaluateKingSafety,
	evaluatePawnStructure,
	scoreMove,
	getHistoryKey
};