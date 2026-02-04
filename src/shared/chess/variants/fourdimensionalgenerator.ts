// src/shared/chess/variants/fourdimensionalgenerator.ts

/**
 * This script dynamically generates the positions of 4 dimensional variants
 * with varying number of boards, board sizes, and positions on each board.
 *
 * Also generates their moveset, and specialVicinity, overrides.
 */

import type { Coords, CoordsKey } from '../util/coordutil.js';
import type { Movesets, RawMovesets } from '../logic/movesets.js';

import bimath from '../../util/math/bimath.js';
import movesets from '../logic/movesets.js';
import coordutil from '../util/coordutil.js';
import icnconverter from '../logic/icn/icnconverter.js';
import fourdimensionalmoves from '../logic/fourdimensionalmoves.js';
import { rawTypes as r, ext as e } from '../util/typeutil.js';

/** An object that contains all relevant quantities for the size of a single 4D chess board. */
type Dimensions = {
	/** The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1 */
	BOARD_SPACING: bigint;
	/** Number of 2D boards in x direction */
	BOARDS_X: bigint;
	/** Number of 2D boards in y direction */
	BOARDS_Y: bigint;
	/** Board edges on the real chessboard */
	MIN_X: bigint;
	/** Board edges on the real chessboard */
	MAX_X: bigint;
	/** Board edges on the real chessboard */
	MIN_Y: bigint;
	/** Board edges on the real chessboard */
	MAX_Y: bigint;
};

// Variables ------------------------------------------------------------------------------------------------

/** Contains all relevant quantities for the size of the 4D chess board. */
let dim: Dimensions | undefined;

/**
 * mov: Contains all relevant parameters for movement logic on the 4D board
 */
const mov = {
	/** true: allow quadragonal and triagonal king and queen movement. false: do not allow it. */
	STRONG_KINGS_AND_QUEENS: false,
	/**
	 * true: pawns can capture along any forward-sideways diagonal, like brawns in  5D chess.
	 * false: pawns can only capture along strictly spacelike or timelike diagonals, like pawns in 5D chess.
	 */
	STRONG_PAWNS: true,
};

// Utility ---------------------------------------------------------------------------------------------------------

function set4DBoardDimensions(boards_x: bigint, boards_y: bigint, board_spacing: bigint): void {
	const MIN_X = 0n;
	const MIN_Y = 0n;
	dim = {
		BOARDS_X: boards_x,
		BOARDS_Y: boards_y,
		BOARD_SPACING: board_spacing,
		MIN_X,
		MAX_X: MIN_X + boards_x * board_spacing,
		MIN_Y,
		MAX_Y: MIN_Y + boards_y * board_spacing,
	};
}

function get4DBoardDimensions(): Dimensions {
	return dim!;
}

function setMovementType(strong_kings_and_queens: boolean, strong_pawns: boolean): void {
	mov.STRONG_KINGS_AND_QUEENS = strong_kings_and_queens;
	mov.STRONG_PAWNS = strong_pawns;
}

/**
 * Returns the type of queen, king, and pawn movements in the last loaded 4 dimension variant.
 * Triagonal? Quadragonal? Brawn?
 */
function getMovementType(): { STRONG_KINGS_AND_QUEENS: boolean; STRONG_PAWNS: boolean } {
	return mov;
}

// Generation ---------------------------------------------------------------------------------------------------------

/**
 * Generate 4D chess position
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param input_position - If this is a position string, populate all 2D boards with it. If it is a dictionary, populate the boards according to it
 * @returns
 */
function gen4DPosition(
	boards_x: bigint,
	boards_y: bigint,
	board_spacing: bigint,
	input_position: string | { [key: string]: string },
): Map<CoordsKey, number> {
	set4DBoardDimensions(boards_x, boards_y, board_spacing);
	const resultPos = new Map<CoordsKey, number>();

	// position is string and should identically populate all 2D boards
	if (typeof input_position === 'string') {
		const input_position_long: Map<CoordsKey, number> =
			icnconverter.generatePositionFromShortForm(input_position).position;

		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim!.MIN_X; i <= dim!.MAX_X; i++) {
			for (let j = dim!.MIN_Y; j <= dim!.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if (i % dim!.BOARD_SPACING === 0n || j % dim!.BOARD_SPACING === 0n) {
					resultPos.set(coordutil.getKeyFromCoords([i, j]), r.VOID + e.N);
					// Add input_position_long to the board
					if (
						i < dim!.MAX_X &&
						i % dim!.BOARD_SPACING === 0n &&
						j < dim!.MAX_Y &&
						j % dim!.BOARD_SPACING === 0n
					) {
						for (const [key, value] of input_position_long) {
							const coords = coordutil.getCoordsFromKey(key);
							const newKey = coordutil.getKeyFromCoords([
								coords[0] + i,
								coords[1] + j,
							]);
							resultPos.set(newKey, value);
						}
					}
				}
			}
		}
	}
	// position is object and should populate 2D boards according to its entries
	else if (typeof input_position === 'object') {
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim!.MIN_X; i <= dim!.MAX_X; i++) {
			for (let j = dim!.MIN_Y; j <= dim!.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if (
					i % dim!.BOARD_SPACING === 0n ||
					i % dim!.BOARD_SPACING === 9n ||
					j % dim!.BOARD_SPACING === 0n ||
					j % dim!.BOARD_SPACING === 9n
				) {
					resultPos.set(coordutil.getKeyFromCoords([i, j]), r.VOID + e.N);
					// Add the subposition to the correct board
					if (
						i < dim!.MAX_X &&
						i % dim!.BOARD_SPACING === 0n &&
						j < dim!.MAX_Y &&
						j % dim!.BOARD_SPACING === 0n
					) {
						const sub_position_short =
							input_position[`${i / dim!.BOARD_SPACING},${j / dim!.BOARD_SPACING}`];
						const sub_position_long: Map<CoordsKey, number> = sub_position_short
							? icnconverter.generatePositionFromShortForm(sub_position_short)
									.position
							: new Map<CoordsKey, number>();
						for (const [key, value] of sub_position_long) {
							const coords = coordutil.getCoordsFromKey(key);
							const newKey = coordutil.getKeyFromCoords([
								coords[0] + i,
								coords[1] + j,
							]);
							resultPos.set(newKey, value);
						}
					}
				}
			}
		}
	}

	return resultPos;
}

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
	set4DBoardDimensions(boards_x, boards_y, board_spacing);
	setMovementType(strong_kings_and_queens, strong_pawns);

	const rawMovesets: RawMovesets = {
		[r.QUEEN]: {
			individual: [],
			sliding: {},
			// Not needed if a worldBorder of 0n is added.
			// ignore: (startCoords: Coords, endCoords: Coords) => {
			// 	return (endCoords[0] > dim!.MIN_X && endCoords[0] < dim!.MAX_X && endCoords[1] > dim!.MIN_Y && endCoords[1] < dim!.MAX_Y);
			// }
		},
		[r.BISHOP]: {
			individual: [],
			sliding: {},
			// Not needed if a worldBorder of 0n is added.
			// ignore: (startCoords: Coords, endCoords: Coords) => {
			// 	return (endCoords[0] > dim!.MIN_X && endCoords[0] < dim!.MAX_X && endCoords[1] > dim!.MIN_Y && endCoords[1] < dim!.MAX_Y);
			// }
		},
		[r.ROOK]: {
			individual: [],
			sliding: {},
			// Not needed if a worldBorder of 0n is added.
			// ignore: (startCoords: Coords, endCoords: Coords) => {
			// 	return (endCoords[0] > dim!.MIN_X && endCoords[0] < dim!.MAX_X && endCoords[1] > dim!.MIN_Y && endCoords[1] < dim!.MAX_Y);
			// }
		},
		[r.KING]: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalKingMove,
		},
		[r.KNIGHT]: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalKnightMove,
		},
		[r.PAWN]: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalPawnMove,
		},
	};

	for (let baseH = 1n; baseH >= -1n; baseH--) {
		for (let baseV = 1n; baseV >= -1n; baseV--) {
			for (let offsetH = 1n; offsetH >= -1n; offsetH--) {
				for (let offsetV = 1n; offsetV >= -1n; offsetV--) {
					const x = dim!.BOARD_SPACING * baseH + offsetH;
					const y = dim!.BOARD_SPACING * baseV + offsetV;

					if (x < 0n) continue; // If the x coordinate is negative, skip this iteration
					if (x === 0n && y <= 0n) continue; // Skip if x is 0 and y is negative
					// Add the moves

					// allow any queen move if STRONG_KINGS_AND_QUEENS, else group her with bishops and rooks
					if (mov.STRONG_KINGS_AND_QUEENS)
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
						if (!mov.STRONG_KINGS_AND_QUEENS)
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
						if (!mov.STRONG_KINGS_AND_QUEENS)
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
	get4DBoardDimensions,
	getMovementType,
	gen4DPosition,
	gen4DMoveset,
	getPawnVicinity,
	getKnightVicinity,
	getKingVicinity,
};
