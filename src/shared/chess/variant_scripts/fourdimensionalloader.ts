// src/shared/chess/variant_scripts/fourdimensionalloader.ts

/**
 * This script dynamically generates the moveset and specialVicinity
 * overrides of 4 dimensional variants with varying number of boards,
 * board sizes, and positions on each board.
 */

import type { Coords } from '../util/coordutil.js';
import type { Movesets, RawMovesets } from '../logic/movesets.js';

import bimath from '../../util/math/bimath.js';
import movesets from '../logic/movesets.js';
import coordutil from '../util/coordutil.js';
import gen4DPosition from './gen4DPosition.js';
import { rawTypes as r } from '../util/typeutil.js';
import fourdimensionalmoves from '../logic/fourdimensionalmoves.js';

// Moveset Overrides --------------------------------------------------------------------------------------------------
/**
 * Generates the moveset for the sliding pieces
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal movement. false: do not allow it
 * @param strong_pawns - true: pawns can capture along any diagonal. false: pawns can only capture along strictly spacelike or timelike diagonals
 * @returns
 */
function gen4DMoveset(
	boards_x: bigint,
	boards_y: bigint,
	board_spacing: bigint,
	strong_kings_and_queens: boolean,
	strong_pawns: boolean,
): Movesets {
	const dim = gen4DPosition.getDimensions(boards_x, boards_y, board_spacing);

	const rawMovesets: RawMovesets = {
		[r.QUEEN]: {
			individual: [],
			sliding: {},
		},
		[r.BISHOP]: {
			individual: [],
			sliding: {},
		},
		[r.ROOK]: {
			individual: [],
			sliding: {},
		},
		[r.KING]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalKingMove(gamefile, coords, color, premove, dim, strong_kings_and_queens), // prettier-ignore
		},
		[r.KNIGHT]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalKnightMove(gamefile, coords, color, premove, dim), // prettier-ignore
		},
		[r.PAWN]: {
			individual: [],
			special: (gamefile, coords, color, premove) =>
				fourdimensionalmoves.fourDimensionalPawnMove(gamefile, coords, color, premove, dim, strong_pawns), // prettier-ignore
		},
	};

	for (let baseH = 1n; baseH >= -1n; baseH--) {
		for (let baseV = 1n; baseV >= -1n; baseV--) {
			for (let offsetH = 1n; offsetH >= -1n; offsetH--) {
				for (let offsetV = 1n; offsetV >= -1n; offsetV--) {
					const x = dim.BOARD_SPACING * baseH + offsetH;
					const y = dim.BOARD_SPACING * baseV + offsetV;

					if (x < 0n) continue; // If the x coordinate is negative, skip this iteration
					if (x === 0n && y <= 0n) continue; // Skip if x is 0 and y is negative
					// Add the moves

					// allow any queen move if STRONG_KINGS_AND_QUEENS, else group her with bishops and rooks
					if (strong_kings_and_queens)
						rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [
							null,
							null,
						];

					// Only add a bishop move if the move moves in two dimensions
					if (
						baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV ===
						2n
					) {
						rawMovesets[r.BISHOP]!.sliding![coordutil.getKeyFromCoords([x, y])] = [
							null,
							null,
						];
						if (!strong_kings_and_queens)
							rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [
								null,
								null,
							];
					}
					// Only add a rook move if the move moves in one dimension
					if (
						baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV ===
						1n
					) {
						rawMovesets[r.ROOK]!.sliding![coordutil.getKeyFromCoords([x, y])] = [
							null,
							null,
						];
						if (!strong_kings_and_queens)
							rawMovesets[r.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [
								null,
								null,
							];
					}
				}
			}
		}
	}

	return movesets.convertRawMovesetsToPieceMovesets(rawMovesets);
}

// Special Vicinity Overrides -----------------------------------------------------------------------------------------

/**
 * Sets the specialVicinity object for the pawn
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @param strong_pawns - true: pawns can capture along any forward-sideways diagonal.
 * 						 false: pawns can only capture along strictly spacelike or timelike diagonals, like in 5D chess
 * @returns
 */
function getPawnVicinity(board_spacing: bigint, strong_pawns: boolean): Coords[] {
	const individualMoves: Coords[] = [];

	for (let baseH = 1n; baseH >= -1n; baseH--) {
		for (let baseV = 1n; baseV >= -1n; baseV--) {
			for (let offsetH = 1n; offsetH >= -1n; offsetH--) {
				for (let offsetV = 1n; offsetV >= -1n; offsetV--) {
					// only allow changing two things at once
					if (
						baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV !==
						2n
					)
						continue;

					// do not allow two moves forward
					if (baseH * baseH + offsetH * offsetH === 2n) continue;

					// do not allow two moves sideways
					if (baseV * baseV + offsetV * offsetV === 2n) continue;

					// disallow strong captures if pawns are weak
					if (
						!strong_pawns &&
						(bimath.abs(baseH) !== bimath.abs(baseV) ||
							bimath.abs(offsetH) !== bimath.abs(offsetV))
					)
						continue;

					const x = board_spacing * baseH + offsetH;
					const y = board_spacing * baseV + offsetV;
					const endCoords = [x, y] as Coords;

					individualMoves.push(endCoords);
				}
			}
		}
	}
	return individualMoves;
}

/**
 * Sets the specialVicinity object for the knight
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @returns
 */
function getKnightVicinity(board_spacing: bigint): Coords[] {
	const individualMoves: Coords[] = [];

	for (let baseH = 2n; baseH >= -2n; baseH--) {
		for (let baseV = 2n; baseV >= -2n; baseV--) {
			for (let offsetH = 2n; offsetH >= -2n; offsetH--) {
				for (let offsetV = 2n; offsetV >= -2n; offsetV--) {
					// If the squared distance to the tile is 5, then add the move
					if (
						baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV ===
						5n
					) {
						const x = board_spacing * baseH + offsetH;
						const y = board_spacing * baseV + offsetV;
						const endCoords = [x, y] as Coords;
						individualMoves.push(endCoords);
					}
				}
			}
		}
	}
	return individualMoves;
}

/**
 * Sets the specialVicinity object for the king
 * @param board_spacing - The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal king and queen movement. false: do not allow it
 * @returns
 */
function getKingVicinity(board_spacing: bigint, strong_kings_and_queens: boolean): Coords[] {
	const individualMoves: Coords[] = [];

	for (let baseH = 1n; baseH >= -1n; baseH--) {
		for (let baseV = 1n; baseV >= -1n; baseV--) {
			for (let offsetH = 1n; offsetH >= -1n; offsetH--) {
				for (let offsetV = 1n; offsetV >= -1n; offsetV--) {
					// only allow moves that change one or two dimensions if triagonals and diagonals are disabled
					if (
						!strong_kings_and_queens &&
						baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV > 2n
					)
						continue;

					const x = board_spacing * baseH + offsetH;
					const y = board_spacing * baseV + offsetV;
					if (x === 0n && y === 0n) continue;
					const endCoords = [x, y] as Coords;

					individualMoves.push(endCoords);
				}
			}
		}
	}
	return individualMoves;
}

// Exports ------------------------------------------------------------------------------------------------------------

export default {
	gen4DMoveset,
	getPawnVicinity,
	getKnightVicinity,
	getKingVicinity,
};
