// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import type { Coords } from "../../../../chess/util/coordutil.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { players, rawTypes } from "../../../../chess/util/typeutil.js";
import type { Move, MoveDraft } from "../../../../chess/logic/movepiece.js";
import type { Player } from '../../../../chess/util/typeutil.js';
// @ts-ignore
import legalmoves from "../../../../chess/logic/legalmoves.js";
// @ts-ignore
import specialdetect from "../../../../chess/logic/specialdetect.js";
import { evalState, SearchData } from "./engine.js";
import evaluation, { PIECE_VALUES } from "./evaluation.js";

const FRIEND_WIGGLE_ROOM = 1; // Friendly wiggle radius
const MAX_ENGINE_SLIDE_CHECK = 50; // Absolute max distance to check for infinite sliders
const HISTORY_MAX_VALUE = 1_000_000; // Prevent overflow/extreme values

// Storage for sliding vectors

/**
 * Helper function to efficiently remove a piece from a coordinates array
 * Uses swap-and-pop technique for O(1) removal after finding the element
 */
function removePieceFromArray(pieceArray: Coords[], x: number, y: number): boolean {
	for (let i = 0; i < pieceArray.length; i++) {
		const [px, py] = pieceArray[i]!;
		if (px === x && py === y) {
			// Use quick removal technique (swap with last element and pop)
			const lastIndex = pieceArray.length - 1;
			if (i !== lastIndex) {
				pieceArray[i] = pieceArray[lastIndex]!;
			}
			pieceArray.pop();
			return true;
		}
	}
	return false;
}

/**
 * Optimized sliding move generator respecting limits and interaction rules.
 * - Limits define the maximum squares (inclusive), blockers are pre-calculated in limits.
 * - Horizontal/Vertical moves use wiggle room based on other pieces (only if the piece can move H/V).
 * - Diagonal moves are generated if the ray intersects *any* diagonal occupied by another piece
 *   (only if the piece can move diagonally).
 *
 * @param startCoords Starting position
 * @param moverColor Color of the piece making the move
 * @param directions Array of direction vectors with limits [dx, dy, negLimit, posLimit]
 * @param legalMoves Array to add legal moves to
 */
function generateSlidingMoves(
	startCoords: Coords,
	moverColor: Player,
	directions: Array<[number, number, number, number]>, // [dx, dy, negLimit, posLimit]
	legalMoves: MoveDraft[]
): void {
	const [startX, startY] = startCoords;

	// Retrieve piece positions from evaluation state
	const enemyMap = moverColor === players.WHITE ? evalState.blackPieceCoords : evalState.whitePieceCoords;
	const friendMap = moverColor === players.WHITE ? evalState.whitePieceCoords : evalState.blackPieceCoords;
	const enemyCoords: Coords[] = [];
	const friendCoords: Coords[] = [];
	for (const a of enemyMap.values()) enemyCoords.push(...a);
	for (const a of friendMap.values()) friendCoords.push(...a);

	// Use globally maintained piece sets for O(1) occupancy ---------------------
	const enemySet = moverColor === players.WHITE ? evalState.blackPieceSet : evalState.whitePieceSet;
	const friendSet = moverColor === players.WHITE ? evalState.whitePieceSet : evalState.blackPieceSet;
	const hasPieceAt = (x: number, y: number): boolean =>
		enemySet.has(`${x},${y}`) || friendSet.has(`${x},${y}`);

	// Build maps for enemy alignment lookups (fast constant-time alignment check)
	const rowCount = new Map<number, number>();
	const colCount = new Map<number, number>();
	const diag1Cnt = new Map<number, number>();
	const diag2Cnt = new Map<number, number>();
	for (const [ex, ey] of enemyCoords) {
		rowCount.set(ey, (rowCount.get(ey) || 0) + 1);
		colCount.set(ex, (colCount.get(ex) || 0) + 1);
		const d1 = ex - ey;
		const d2 = ex + ey;
		diag1Cnt.set(d1, (diag1Cnt.get(d1) || 0) + 1);
		diag2Cnt.set(d2, (diag2Cnt.get(d2) || 0) + 1);
	}

	// Helpers that check for a CLEAR enemy piece in a given line -----------------
	const hasClearEnemyRow = (sqX: number, sqY: number): boolean => {
		for (const dir of [-1, 1] as const) {
			for (let step = 1; step <= MAX_ENGINE_SLIDE_CHECK; step++) {
				const x = sqX + dir * step;
				if (!hasPieceAt(x, sqY)) continue;
				if (enemySet.has(`${x},${sqY}`)) return true; // first blocker is enemy
				break; // first blocker is friendly
			}
		}
		return false;
	};

	const hasClearEnemyCol = (sqX: number, sqY: number): boolean => {
		for (const dir of [-1, 1] as const) {
			for (let step = 1; step <= MAX_ENGINE_SLIDE_CHECK; step++) {
				const y = sqY + dir * step;
				if (!hasPieceAt(sqX, y)) continue;
				if (enemySet.has(`${sqX},${y}`)) return true;
				break;
			}
		}
		return false;
	};

	const hasClearEnemyDiag = (sqX: number, sqY: number): boolean => {
		for (const dirX of [-1, 1] as const) {
			for (const dirY of [-1, 1] as const) {
				for (let step = 1; step <= MAX_ENGINE_SLIDE_CHECK; step++) {
					const x = sqX + dirX * step;
					const y = sqY + dirY * step;
					if (!hasPieceAt(x, y)) continue;
					if (enemySet.has(`${x},${y}`)) return true;
					break;
				}
			}
		}
		return false;
	};

	// Capability flags inferred from directions list
	const canDiag   = directions.some(([dx, dy]) => dx !== 0 && dy !== 0);
	const canHoriz  = directions.some(([dx, dy]) => dy === 0 && dx !== 0);
	const canVert   = directions.some(([dx, dy]) => dx === 0 && dy !== 0);

	// Pre-filter friend wiggle candidates (needed for vertical/horizontal wiggle rule)
	const wiggleVert: Coords[] = [];
	const wiggleHoriz: Coords[] = [];
	if (canVert || canHoriz) {
		for (const [fx, fy] of friendCoords) {
			if (canVert && Math.abs(fx - startX) <= FRIEND_WIGGLE_ROOM) wiggleVert.push([fx, fy]);
			if (canHoriz && Math.abs(fy - startY) <= FRIEND_WIGGLE_ROOM) wiggleHoriz.push([fx, fy]);
		}
	}

	for (const [dirX, dirY, negLimit, posLimit] of directions) {
		if (dirX === 0 && dirY === 0) continue; // skip zero vector

		// Handle both positive and negative rays with the same helper.
		addRay(dirX, dirY, posLimit);
		addRay(-dirX, -dirY, negLimit);
	}

	/**
     * Adds moves along a single ray.
     * A square is added if at least one other piece is aligned (row/col/diag) with that square.
     * If no such alignment exists, H/V rays can still add the square if it is within WIGGLE_ROOM
     * of some nearby piece ("wiggle" rule).
     * If a piece exists ON the ray, movement never extends past the first such piece and the
     * wiggle rule is ignored beyond that point.
     */
	function addRay(dx: number, dy: number, limit: number): void {
		if (dx === 0 && dy === 0) return;
		const maxDist = Number.isFinite(limit) ? Math.abs(limit) : MAX_ENGINE_SLIDE_CHECK;
		if (maxDist <= 0) return;

		const isVertical   = dx === 0;
		const isHorizontal = dy === 0;
		const isDiagonal   = !isVertical && !isHorizontal;
		const stepSignX    = Math.sign(dx);
		const stepSignY    = Math.sign(dy);

		// Helper: returns true if coords lie on the ray ahead of start
		const isOnCurrentRay = (px: number, py: number): boolean => {
			if (isVertical) {
				return px === startX && stepSignY * (py - startY) > 0;
			}
			if (isHorizontal) {
				return py === startY && stepSignX * (px - startX) > 0;
			}
			// diagonal case
			const relX = px - startX;
			const relY = py - startY;
			return Math.abs(relX) === Math.abs(relY) && stepSignX * relX > 0 && stepSignY * relY > 0;
		};

		// Find nearest blocker (enemy or friendly)
		let closestPieceDist = Infinity;
		for (const [px, py] of enemyCoords.concat(friendCoords)) {
			const dX = px - startX;
			const dY = py - startY;

			if (
				(isVertical   && px === startX && Math.sign(dY) === stepSignY) ||
                (isHorizontal && py === startY && Math.sign(dX) === stepSignX) ||
                (isDiagonal   && Math.abs(dX) === Math.abs(dY) && Math.sign(dX) === stepSignX && Math.sign(dY) === stepSignY)
			) {
				const dist = isVertical ? Math.abs(dY) : isHorizontal ? Math.abs(dX) : Math.abs(dX);
				if (dist < closestPieceDist) closestPieceDist = dist;
			}
		}
		const effectiveMax = Math.min(maxDist, closestPieceDist);

		// Iterate outward one square at a time until effectiveMax (inclusive).
		for (let d = 1; d <= effectiveMax; d++) {
			const sqX = startX + dx * d;
			const sqY = startY + dy * d;

			const captureTarget = d === closestPieceDist; // square with blocker (may be Infinity)

			// Determine alignment while ensuring no intervening piece blocks the view
			let aligned = false;
			if (isVertical) {
				if (canHoriz && rowCount.get(sqY) && hasClearEnemyRow(sqX, sqY)) aligned = true;
				if (!aligned && canDiag && (diag1Cnt.get(sqX - sqY) || diag2Cnt.get(sqX + sqY)) && hasClearEnemyDiag(sqX, sqY)) aligned = true;
			} else if (isHorizontal) {
				if (canVert && colCount.get(sqX) && hasClearEnemyCol(sqX, sqY)) aligned = true;
				if (!aligned && canDiag && (diag1Cnt.get(sqX - sqY) || diag2Cnt.get(sqX + sqY)) && hasClearEnemyDiag(sqX, sqY)) aligned = true;
			} else { // diagonal ray
				if (canDiag && (diag1Cnt.get(sqX - sqY) || diag2Cnt.get(sqX + sqY)) && hasClearEnemyDiag(sqX, sqY)) aligned = true;
				if (!aligned && canHoriz && rowCount.get(sqY) && hasClearEnemyRow(sqX, sqY)) aligned = true;
				if (!aligned && canVert && colCount.get(sqX) && hasClearEnemyCol(sqX, sqY)) aligned = true;
			}

			// Wiggle: friend proximity only
			let wiggled = false;
			if (!aligned && !captureTarget && (isVertical || isHorizontal)) {
				const list = isVertical ? wiggleVert : wiggleHoriz;
				for (const [fx, fy] of list) {
					if (isOnCurrentRay(fx, fy)) continue;
					const proj = (isVertical ? fy - startY : fx - startX) * (isVertical ? stepSignY : stepSignX);
					if (proj >= 0 && Math.abs(d - proj) <= FRIEND_WIGGLE_ROOM) { wiggled = true; break; }
				}
			}

			if (captureTarget || aligned || wiggled) {
				legalMoves.push({ startCoords, endCoords: [sqX, sqY] });
			}
		}
	}
}

/**
 * Ultra-optimized legal move generator that uses fast lookups and minimizes redundant processing
 * 
 * @param lf Current game file state
 * @param player The player to generate moves for
 * @returns Array of legal moves
 */
function generateLegalMoves(lf: gamefile, player: Player): MoveDraft[] {
	// Pre-allocate output array with estimated capacity to avoid resizing
	const legalMoves: MoveDraft[] = [];
	const pieceMap = lf.pieces;
	
	// Get all piece coordinates in one pass and filter by player
	const allPieces = boardutil.getCoordsOfAllPieces(pieceMap);
	
	// Local reusable objects to avoid GC pressure
	let piece, legalMovesResult;
	let slidingDirections: Array<[number, number, number, number]>;
	
	// Faster for-loop with direct indexing
	for (let i = 0; i < allPieces.length; i++) {
		const coords = allPieces[i]!;
		piece = boardutil.getPieceFromCoords(pieceMap, coords);

		// Skip pieces that don't exist or belong to the opponent
		if (!piece || typeutil.getColorFromType(piece.type) !== player) {
			continue;
		}
		
		// Get legal moves for this piece (reuse result object)
		legalMovesResult = legalmoves.calculate(lf, piece);

		// --- Fast-path for Individual Moves ---
		const individualMoves = legalMovesResult.individual;
		if (individualMoves && individualMoves.length > 0) {
			for (let j = 0; j < individualMoves.length; j++) {
				const endCoords = individualMoves[j]!;
				const moveDraft: MoveDraft = { startCoords: coords, endCoords };

				// Handle special flags (castling, en passant)
				specialdetect.transferSpecialFlags_FromCoordsToMove(endCoords, moveDraft);

				// Handle pawn promotion - create two moves (Queen and Knight)
				if (endCoords.promoteTrigger) {
					// Queen promotion (most common)
					legalMoves.push({ 
						startCoords: coords, 
						endCoords, 
						promotion: typeutil.buildType(rawTypes.QUEEN, player) 
					});
					
					// Knight promotion
					legalMoves.push({ 
						startCoords: coords, 
						endCoords, 
						promotion: typeutil.buildType(rawTypes.KNIGHT, player) 
					});
				} else {
					// Standard move
					legalMoves.push(moveDraft);
				}
			}
		}

		// --- Calculate Sliding Moves (directional) ---
		const slidingMoves = legalMovesResult.sliding;
		if (slidingMoves && Object.keys(slidingMoves).length > 0) {
			// Reuse array to avoid allocations with proper typing
			slidingDirections = [] as Array<[number, number, number, number]>;
			
			// Convert sliding directions to the format expected by generateSlidingMoves
			for (const key in slidingMoves) {
				const direction = key.split(',').map(Number) as [number, number];
				const [limitNeg, limitPos] = slidingMoves[key];
				
				// Add direction with its limits as a properly typed tuple
				slidingDirections.push([direction[0], direction[1], limitNeg, limitPos]);
			}
			
			// Generate all sliding moves with optimized implementation
			generateSlidingMoves(coords, player, slidingDirections, legalMoves);
		}
	}

	return legalMoves;
}

/**
 * Compares two MoveDraft objects for equality.
 * @param move1 The first move.
 * @param move2 The second move.
 * @returns True if the moves are equal, false otherwise.
 */
function movesAreEqual(move1: MoveDraft | null | undefined, move2: MoveDraft | null | undefined): boolean {
	if (!move1 || !move2) {
		return move1 === move2; // Handles cases where one or both are null/undefined
	}
	return (
		move1.startCoords[0] === move2.startCoords[0] &&
		move1.startCoords[1] === move2.startCoords[1] &&
		move1.endCoords[0] === move2.endCoords[0] &&
		move1.endCoords[1] === move2.endCoords[1] &&
		(move1.promotion || null) === (move2.promotion || null) // Treat undefined/null promotion as equivalent
	);
}

/** Helper function to generate a key for the history table */
function getHistoryKey(pieceType: number, endCoords: Coords): string {
	// Simple string key, could use hashing for potentially better distribution/performance
	return `${pieceType}-${endCoords[0]}-${endCoords[1]}`;
}

/** Helper function to update the history score for a move */
function updateHistoryScore(
	lf: gamefile,
	move: MoveDraft,
	depth: number,
	history_heuristic_table: Map<string, number> 
) {
	const movingPiece = boardutil.getPieceFromCoords(lf.pieces, move.startCoords);
	if (!movingPiece) return; // Piece not found (shouldn't happen in normal flow)
	const movingPieceType = movingPiece.type;
	const key = getHistoryKey(movingPieceType, move.endCoords);
	const currentScore = history_heuristic_table.get(key) || 0;
	const increment = depth * depth; // Weight by depth squared
	// Use Math.min to prevent score from growing excessively large
	history_heuristic_table.set(key, Math.min(currentScore + increment, HISTORY_MAX_VALUE));
}

/** Helper function to decay history scores */
function decayHistoryScores(
	history_heuristic_table: Map<string, number> 
) {
	for (const [key, score] of history_heuristic_table.entries()) {
		// Decay by dividing (integer division effectively)
		const newScore = Math.floor(score / 2);
		if (newScore === 0) {
			history_heuristic_table.delete(key); // Remove entries that decay to zero
		} else {
			history_heuristic_table.set(key, newScore);
		}
	}
}

function enable_pv_scoring(moves: MoveDraft[], pv_table: (MoveDraft | null | undefined)[][], data: SearchData) {
	data.follow_pv = false;

	for (const move of moves) {
		if (movesAreEqual(move, pv_table[0]![data.ply])) {
			data.follow_pv = true;
			data.score_pv = true;
			break;
		}
	}
}

/**
 * Updates evaluation state before making a move (removes pieces from old positions)
 * @param lf Current game state
 * @param fullMove The move to be made
 * @returns Object containing information needed to restore state later
 */
function updateEvalBeforeMove(lf: gamefile, fullMove: Move) {
	// Save captured piece info for later restoration
	const capturedPiece = boardutil.getPieceFromCoords(lf.pieces, fullMove.endCoords);
	const capturedPieceType: number | undefined = capturedPiece?.type;
	
	// Get information about the moved piece and remove from old position
	const movingPiece = boardutil.getPieceFromCoords(lf.pieces, fullMove.startCoords);
	if (movingPiece) {
		const [startX, startY] = fullMove.startCoords;
		const movingRawType = typeutil.getRawType(movingPiece.type);
		const movingColor = typeutil.getColorFromType(movingPiece.type);
		
		// Get piece array directly for faster access
		const pieceArray = movingColor === players.WHITE ? 
			evalState.whitePieceCoords.get(movingRawType) : 
			evalState.blackPieceCoords.get(movingRawType);
		
		if (pieceArray) {
			// Fast removal from array without findIndex
			removePieceFromArray(pieceArray, startX, startY);
		}
		
		// Update pawn file tracking if this is a pawn
		if (movingRawType === rawTypes.PAWN) {
			if (movingColor === players.WHITE) {
				evalState.whitePawnFiles[startX]!--;
			} else {
				evalState.blackPawnFiles[startX]!--;
			}
		}
		
		// Remove from piece set
		const key = `${startX},${startY}`;
		if (movingColor === players.WHITE) {
			evalState.whitePieceSet.delete(key);
		} else {
			evalState.blackPieceSet.delete(key);
		}
		
		// Handle castling: also remove rook from its original square (no material change)
		if (fullMove.castle) {
			const [rx, ry] = fullMove.castle.coord;
			const rookKey = `${rx},${ry}`;
			const rookArray = movingColor === players.WHITE ? evalState.whitePieceCoords.get(rawTypes.ROOK)! : evalState.blackPieceCoords.get(rawTypes.ROOK)!;
			removePieceFromArray(rookArray, rx, ry);
			if (movingColor === players.WHITE) evalState.whitePieceSet.delete(rookKey); else evalState.blackPieceSet.delete(rookKey);
		}
	}
	
	return capturedPieceType;
}

/**
 * Updates evaluation state after making a move (adding pieces to new positions, updating material scores)
 * @param lf Current game state
 * @param fullMove The move that was made
 * @param capturedPieceType The type of piece that was captured (if any)
 */
function updateEvalAfterMove(lf: gamefile, fullMove: Move, capturedPieceType: number | undefined) {
	const [endX] = fullMove.endCoords;
	const endKey = `${fullMove.endCoords[0]},${fullMove.endCoords[1]}`;
	
	// 1. Handle captured piece (update material score and remove from tracking)
	if (fullMove.flags.capture && capturedPieceType !== undefined) {
		const capRawType = typeutil.getRawType(capturedPieceType);
		const capColor = typeutil.getColorFromType(capturedPieceType);
		const capPieceValue = PIECE_VALUES[capRawType] || 0;
		
		// Update material score based on the color of the captured piece
		evalState.materialScore += (capColor === players.WHITE ? -capPieceValue : capPieceValue);
		
		// Track pawn files for captured pawns
		if (capRawType === rawTypes.PAWN) {
			if (capColor === players.WHITE) {
				evalState.whitePawnFiles[endX]!--;
			} else {
				evalState.blackPawnFiles[endX]!--;
			}
		}
		
		// Remove captured piece from its color set
		if (capColor === players.WHITE) {
			evalState.whitePieceSet.delete(endKey);
		} else {
			evalState.blackPieceSet.delete(endKey);
		}
	}
	
	// 2. Update position of moved piece
	const movedPiece = boardutil.getPieceFromCoords(lf.pieces, fullMove.endCoords);
	if (movedPiece) {
		const rawType = typeutil.getRawType(movedPiece.type);
		const color = typeutil.getColorFromType(movedPiece.type);
		const pieceArray = color === players.WHITE ? 
			evalState.whitePieceCoords.get(rawType) : evalState.blackPieceCoords.get(rawType);
		
		// Add piece to its new position
		if (pieceArray) {
			pieceArray.push(fullMove.endCoords);
		}
		
		// Track pawn files for moved pawns
		if (rawType === rawTypes.PAWN) {
			if (color === players.WHITE) {
				evalState.whitePawnFiles[endX]!++;
			} else {
				evalState.blackPawnFiles[endX]!++;
			}
		}
		
		// Handle promotion material change (pawn already counted previously)
		if (fullMove.promotion !== undefined) {
			const promoRaw = typeutil.getRawType(fullMove.promotion);
			const delta = (PIECE_VALUES[promoRaw] ?? 0) - (PIECE_VALUES[rawTypes.PAWN] ?? 0);
			if (delta) evalState.materialScore += (color === players.WHITE ? delta : -delta);
		}
		
		// Special handling for kings - update dedicated tracking variables
		if (rawType === rawTypes.KING) {
			if (color === players.WHITE) {
				evalState.whiteKingCoords = fullMove.endCoords;
			} else {
				evalState.blackKingCoords = fullMove.endCoords;
			}
		}
		
		// Add moved piece to its color set
		if (color === players.WHITE) {
			evalState.whitePieceSet.add(endKey);
		} else {
			evalState.blackPieceSet.add(endKey);
		}
		
		// Handle castling: add rook to its new square
		if (fullMove.castle) {
			const dir = fullMove.castle.dir;
			const rookEndX = fullMove.endCoords[0] - dir; // rook ends adjacent to king
			const rookEndY = fullMove.endCoords[1];
			const rookEndKey = `${rookEndX},${rookEndY}`;
			const rookArray = color === players.WHITE ? evalState.whitePieceCoords.get(rawTypes.ROOK)! : evalState.blackPieceCoords.get(rawTypes.ROOK)!;
			rookArray.push([rookEndX, rookEndY]);
			if (color === players.WHITE) evalState.whitePieceSet.add(rookEndKey); else evalState.blackPieceSet.add(rookEndKey);
		}
	}
}

/**
 * Updates evaluation state when undoing a move (reverses the effects of makeMove)
 * @param lf Current game state
 * @param fullMove The move that was undone
 * @param capturedPieceType The type of piece that was captured (if any)
 */
function updateEvalUndoMove(lf: gamefile, fullMove: Move, capturedPieceType: number | undefined) {
	const [endX, endY] = fullMove.endCoords;
	const [startX] = fullMove.startCoords;
	const startKey = `${fullMove.startCoords[0]},${fullMove.startCoords[1]}`;
	const endKey = `${endX},${endY}`;
	
	// 1. Handle the moved piece (which is now at the start position)
	const restoredPiece = boardutil.getPieceFromCoords(lf.pieces, fullMove.startCoords);
	if (restoredPiece) {
		const rawType = typeutil.getRawType(restoredPiece.type);
		const color = typeutil.getColorFromType(restoredPiece.type);
		const pieceArray = color === players.WHITE ? 
			evalState.whitePieceCoords.get(rawType) : evalState.blackPieceCoords.get(rawType);
		
		// Add piece back to its original position
		if (pieceArray) {
			pieceArray.push(fullMove.startCoords);
		}
		
		// Update pawn file tracking if a pawn was moved
		if (rawType === rawTypes.PAWN) {
			if (color === players.WHITE) {
				evalState.whitePawnFiles[startX]!--;
				evalState.whitePawnFiles[endX]!--;
			} else {
				evalState.blackPawnFiles[startX]!--;
				evalState.blackPawnFiles[endX]!--;
			}
		}
		
		// Update king position tracking if king was moved
		if (rawType === rawTypes.KING) {
			if (color === players.WHITE) {
				evalState.whiteKingCoords = fullMove.startCoords;
			} else {
				evalState.blackKingCoords = fullMove.startCoords;
			}
		}
		
		// Add back to piece set
		if (color === players.WHITE) {
			evalState.whitePieceSet.add(startKey);
		} else {
			evalState.blackPieceSet.add(startKey);
		}
		
		// Handle castling: move rook back to its original square
		if (fullMove.castle) {
			const dir = fullMove.castle.dir;
			const rookStartX = fullMove.castle.coord[0];
			const rookStartY = fullMove.castle.coord[1];
			const rookEndX = fullMove.endCoords[0] - dir;
			const rookEndY = fullMove.endCoords[1];
			const rookStartKey = `${rookStartX},${rookStartY}`;
			const rookEndKey = `${rookEndX},${rookEndY}`;
			const kingColor = typeutil.getColorFromType(restoredPiece.type);
			const rookArray = kingColor === players.WHITE ? evalState.whitePieceCoords.get(rawTypes.ROOK)! : evalState.blackPieceCoords.get(rawTypes.ROOK)!;
			// Remove rook from end square
			removePieceFromArray(rookArray, rookEndX, rookEndY);
			if (kingColor === players.WHITE) evalState.whitePieceSet.delete(rookEndKey); else evalState.blackPieceSet.delete(rookEndKey);
			// Add rook back to start square
			rookArray.push([rookStartX, rookStartY]);
			if (kingColor === players.WHITE) evalState.whitePieceSet.add(rookStartKey); else evalState.blackPieceSet.add(rookStartKey);
		}
	}
	
	// 2. Restore captured piece if there was one
	if (fullMove.flags.capture && capturedPieceType !== undefined) {
		const capRawType = typeutil.getRawType(capturedPieceType);
		const capColor = typeutil.getColorFromType(capturedPieceType);
		const capPieceValue = PIECE_VALUES[capRawType] || 0;
		
		// Restore material score
		evalState.materialScore -= (capColor === players.WHITE ? -capPieceValue : capPieceValue);
		
		// Add captured piece back to piece array tracking
		const pieceArray = capColor === players.WHITE ? 
			evalState.whitePieceCoords.get(capRawType) : evalState.blackPieceCoords.get(capRawType);
		
		if (pieceArray) {
			pieceArray.push(fullMove.endCoords);
		}
		
		// Update pawn file tracking if captured piece was a pawn
		if (capRawType === rawTypes.PAWN) {
			if (capColor === players.WHITE) {
				evalState.whitePawnFiles[endX]!--;
			} else {
				evalState.blackPawnFiles[endX]!--;
			}
		}
		
		// Restore captured piece to set
		if (capColor === players.WHITE) {
			evalState.whitePieceSet.add(endKey);
		} else {
			evalState.blackPieceSet.add(endKey);
		}
	}
	
	// Revert promotion material if applicable
	if (fullMove.promotion !== undefined) {
		const promoRaw = typeutil.getRawType(fullMove.promotion);
		const delta = (PIECE_VALUES[promoRaw] ?? 0) - (PIECE_VALUES[rawTypes.PAWN] ?? 0);
		if (delta) evalState.materialScore -= (typeutil.getColorFromType(fullMove.promotion) === players.WHITE ? delta : -delta);
	}
}

/**
 * Assigns scores to all moves in the array without sorting them
 * @param lf Current game state
 * @param moves Array of moves to score
 * @param data Search data object
 * @param pvTable Principal variation table
 * @param killerMoves Killer moves table
 * @param historyTable History heuristic table
 * @param ttBestMove Best move from transposition table (if any)
 * @returns Array of scores corresponding to each move
 */
function assignMoveScores(
	lf: gamefile,
	moves: MoveDraft[],
	data: SearchData,
	pvTable: (MoveDraft | null | undefined)[][],
	killerMoves: Array<Array<MoveDraft | null>>,
	historyTable: Map<string, number>,
	ttBestMove?: MoveDraft | null
): number[] {
	const moveScores: number[] = new Array(moves.length).fill(0);
	
	// Score each move individually without sorting
	for (let i = 0; i < moves.length; i++) {
		const move = moves[i];
		if (move) {
			moveScores[i] = evaluation.scoreMove(
				move, 
				lf, 
				data, 
				pvTable, 
				killerMoves, 
				historyTable, 
				ttBestMove
			);
		}
	}
	
	return moveScores;
}

/**
 * Finds the next best move based on pre-calculated scores
 * @param moves Array of moves
 * @param moveScores Array of corresponding move scores
 * @param startIndex Index to start searching from
 * @returns Index of the best move
 */
function selectNextBestMove(
	moves: MoveDraft[],
	moveScores: number[],
	startIndex: number
): number {
	let bestScore = moveScores[startIndex] || -Infinity;
	let bestIndex = startIndex;
	
	// Find the move with the highest score starting from startIndex
	for (let i = startIndex + 1; i < moves.length; i++) {
		if ((moveScores[i] || -Infinity) > bestScore) {
			bestScore = moveScores[i] || -Infinity;
			bestIndex = i;
		}
	}
	
	// Swap the best move with the current position if needed
	if (bestIndex !== startIndex) {
		// Swap the moves
		[moves[startIndex], moves[bestIndex]] = [moves[bestIndex]!, moves[startIndex]!];
		
		// Swap the scores
		[moveScores[startIndex], moveScores[bestIndex]] = [moveScores[bestIndex]!, moveScores[startIndex]!];
	}
	
	return bestIndex;
}

export default {
	generateLegalMoves,
	movesAreEqual,
	getHistoryKey,
	updateHistoryScore,
	decayHistoryScores,
	enable_pv_scoring,
	updateEvalBeforeMove,
	updateEvalAfterMove,
	updateEvalUndoMove,
	assignMoveScores,
	selectNextBestMove
};