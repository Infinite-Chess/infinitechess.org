// @ts-ignore
import type { gamefile } from "../../../../chess/logic/gamefile.js";
import type { Coords } from "../../../../chess/util/coordutil.js";
import boardutil from "../../../../chess/util/boardutil.js";
import typeutil, { rawTypes } from "../../../../chess/util/typeutil.js";
import type { MoveDraft } from "../../../../chess/logic/movepiece.js";
import type { Player } from '../../../../chess/util/typeutil.js';
// @ts-ignore
import legalmoves from "../../../../chess/logic/legalmoves.js";
// @ts-ignore
import specialdetect from "../../../../chess/logic/specialdetect.js";

const WIGGLE_ROOM = 3; // How far off the direct path to check for nearby pieces
const MAX_ENGINE_SLIDE_CHECK = 50; // Absolute max distance to check for infinite sliders

/**
 * Collects the valid move distances along a sliding direction, respecting blocking pieces.
 *
 * @param lf Game file state.
 * @param startCoords The starting coordinates of the piece.
 * @param moveDir The direction of the move.
 * @param maxSteps The maximum steps allowed (Infinity for infinite sliders).
 * @param minSteps The minimum steps allowed (usually <= 0, must be >= 1).
 * @returns A Set of potential distances to check (further filtering needed for blocking).
 */
function collectSlidingDistances(
	lf: gamefile,
	startCoords: Coords, // Starting coordinates
	moveDir: [number, number], // Direction vector [dx, dy]
	maxSteps: number,     // Maximum steps allowed (Infinity for infinite sliders)
	minSteps: number      // Minimum steps allowed (usually <= 0, must be >= 1)
): Set<number> {
	const distancesToCheck = new Set<number>();

	// --- Calculate limit based on nearby pieces --- 
	const [startX, startY] = startCoords;
	const [dirX, dirY] = moveDir;
	let maxDistWithNearbyPiece = 0; // Furthest projected distance 'd' with a piece nearby

	const allPieceCoords = boardutil.getCoordsOfAllPieces(lf.pieces);

	for (const targetCoord of allPieceCoords) {
		const [targetX, targetY] = targetCoord;

		// Skip self
		if (targetX === startX && targetY === startY) continue;

		const dx = targetX - startX;
		const dy = targetY - startY;

		let d_proj = 0;
		let in_correct_direction = false; 
		let is_diagonal = false;

		// Determine projected distance based on move direction
		if (dirY === 0) { // Horizontal move
			in_correct_direction = (Math.sign(dx) === Math.sign(dirX) && dx !== 0);
			if (in_correct_direction) {
				d_proj = Math.abs(dx);
			}
		} else if (dirX === 0) { // Vertical move
			in_correct_direction = (Math.sign(dy) === Math.sign(dirY) && dy !== 0);
			if (in_correct_direction) {
				d_proj = Math.abs(dy);
			}
		} else if (Math.abs(dirX) === Math.abs(dirY)) { // Diagonal move
			const dx_sign = Math.sign(dx);
			const dy_sign = Math.sign(dy);
			in_correct_direction = (dx_sign === Math.sign(dirX) || dx === 0) && 
								   (dy_sign === Math.sign(dirY) || dy === 0) && 
								   (dx !== 0 || dy !== 0); // Ensure it's not the start square
			is_diagonal = true;
			if (in_correct_direction) {
				d_proj = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance along diagonal
			}
		}

		if (in_correct_direction) {
			let within_wiggle = false;
			if (is_diagonal) {
				// Diagonal check
				const projX = startX + dirX * d_proj;
				const projY = startY + dirY * d_proj;
				const d_perp_x = Math.abs(targetX - projX);
				const d_perp_y = Math.abs(targetY - projY);
				within_wiggle = (d_perp_x <= WIGGLE_ROOM || d_perp_y <= WIGGLE_ROOM);
			} else if (dirY === 0) { // Horizontal move check
				within_wiggle = (Math.abs(dy) <= WIGGLE_ROOM);
			} else { // Vertical move check (dirX === 0)
				within_wiggle = (Math.abs(dx) <= WIGGLE_ROOM);
			}

			if (within_wiggle) {
				maxDistWithNearbyPiece = Math.max(maxDistWithNearbyPiece, d_proj);
			}
		}
	}

	// --- Determine the unified upper bound --- 
	const nearbyLimit = maxDistWithNearbyPiece + WIGGLE_ROOM;
	// Consider maxSteps (if finite), nearbyLimit, and the absolute engine check limit
	const upperBound = Math.min(
		Number.isFinite(maxSteps) ? maxSteps : Infinity, // Use actual maxSteps if finite
		nearbyLimit, 
		MAX_ENGINE_SLIDE_CHECK
	);

	// --- Generate distances up to the calculated limit --- 
	const startDistance = Math.max(1, minSteps); 
	for (let d = startDistance; d <= upperBound; d++) {
		distancesToCheck.add(d);
	}

	// --- Ensure max check distance is included for infinite sliders --- 
	if (!Number.isFinite(maxSteps)) {
		// Always add the maximum check distance for infinite sliders
		distancesToCheck.add(MAX_ENGINE_SLIDE_CHECK);
	}

	return distancesToCheck;
}

function generateLegalMoves(lf: gamefile, player: Player): MoveDraft[] {
	const legalMoves: MoveDraft[] = [];
	const allPieceCoords = boardutil.getCoordsOfAllPieces(lf.pieces);

	for (const coords of allPieceCoords) {
		const piece = boardutil.getPieceFromCoords(lf.pieces, coords);

		// Check if the piece exists and belongs to the current player
		if (!piece || typeutil.getColorFromType(piece.type) !== player) {
			continue;
		}
		
		// Get legal moves for this piece
		const legalMovesResult = legalmoves.calculate(lf, piece);

		// --- Calculate Individual Moves ---
		for (const endCoords of legalMovesResult.individual) {
			const validEndCoords = endCoords as Coords;
			const moveDraft: MoveDraft = { startCoords: piece.coords, endCoords: validEndCoords };

			// Check and transfer special move flags (castling, en passant)
			specialdetect.transferSpecialFlags_FromCoordsToMove(endCoords, moveDraft);

			// Handle Pawn Promotion
			if (endCoords.promoteTrigger) {
				// Add moves for queen and knight
				moveDraft.promotion = typeutil.buildType(rawTypes.QUEEN, player);
				legalMoves.push({ startCoords: piece.coords, endCoords: validEndCoords, promotion: typeutil.buildType(rawTypes.QUEEN, player) });
				moveDraft.promotion = typeutil.buildType(rawTypes.KNIGHT, player);
				legalMoves.push({ startCoords: piece.coords, endCoords: validEndCoords, promotion: typeutil.buildType(rawTypes.KNIGHT, player) });
				continue; // Skip adding the non-promoted move
			}

			// Add regular or other special moves (castling/en passant) to the list
			legalMoves.push(moveDraft);
		}

		// --- Calculate Sliding Moves ---
		// (Sliding moves don't involve castling, en passant, or promotion)
		if (legalMovesResult.sliding) {
			for (const key in legalMovesResult.sliding) {
				const direction = key.split(',').map(Number) as [number, number];
				const [minSteps, maxSteps] = legalMovesResult.sliding[key];
				
				// Collect valid distances considering blocking pieces
				const distancesToCheck = collectSlidingDistances(
					lf,
					piece.coords,
					direction,
					maxSteps,
					minSteps
				);

				// Add valid moves from the collected distances
				for (const distance of distancesToCheck) {
					const endCoords: Coords = [
						piece.coords[0] + direction[0] * distance,
						piece.coords[1] + direction[1] * distance
					];
					// Directly add the move and its score
					legalMoves.push({ startCoords: piece.coords, endCoords: endCoords });
				}
			}
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

export default {
	collectSlidingDistances,
	generateLegalMoves,
	movesAreEqual
};