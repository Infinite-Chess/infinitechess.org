/* eslint-disable max-depth */

/**
 * This script generates the position and piece movesets for the 5D Chess variant.
 */

import type { Movesets } from "../logic/movesets.js";
import type { Position } from "./variant.js";
import type { Coords, CoordsKey } from "../util/coordutil.js";


import coordutil from "../util/coordutil.js";
import fourdimensionalmoves from "../logic/fourdimensionalmoves.js";
// @ts-ignore
import formatconverter from "../logic/formatconverter.js";

/**
 * dim: contains all relevant quantities for the size of the 4D chess board.
 * @param BOARD_SPACING: The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * @param BOARDS_X: number of 2D boards in x-direction.
 * @param BOARDS_Y: number of 2D boards in y-direction.
 * @param MIN_X Board edges on the real chessboard.
 * @param MAX_X Board edges on the real chessboard.
 * @param MAX_X Board edges on the real chessboard.
 * @param MAX_Y Board edges on the real chessboard.
 */
const dim: {
	BOARD_SPACING: number;
	BOARDS_X: number;
	BOARDS_Y: number;
	MIN_X: number;
	MAX_X: number;
	MIN_Y: number;
	MAX_Y: number;
} = {
	BOARD_SPACING: NaN,
	BOARDS_X: NaN,
	BOARDS_Y: NaN,
	MIN_X: NaN,
	MAX_X: NaN,
	MIN_Y: NaN,
	MAX_Y: NaN
};

/**
 * mov: contains all relevant information for movement logic
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal king and queen movement. false: do not allow it
 * @param strong_pawns - true: pawns can capture along any forward-sideways diagonal. false: pawns can only capture along strictly spacelike or timelike diagonals, like in 5D chess
 */
const mov: {
	STRONG_KINGS_AND_QUEENS: boolean;
	STRONG_PAWNS: boolean;
} = {
	STRONG_KINGS_AND_QUEENS: false,
	STRONG_PAWNS: true
};

function set4DBoardDimensions(boards_x: number, boards_y: number, board_spacing: number) {
	dim.BOARDS_X = boards_x;
	dim.BOARDS_Y = boards_y;
	dim.BOARD_SPACING = board_spacing;
	dim.MIN_X = 0;
	dim.MAX_X = dim.MIN_X + dim.BOARDS_X * dim.BOARD_SPACING;
	dim.MIN_Y = 0;
	dim.MAX_Y = dim.MIN_Y + dim.BOARDS_Y * dim.BOARD_SPACING;
}

function get4DBoardDimensions() {
	return dim;
}

function setMovementType(strong_kings_and_queens: boolean, strong_pawns: boolean) {
	mov.STRONG_KINGS_AND_QUEENS = strong_kings_and_queens;
	mov.STRONG_PAWNS = strong_pawns;
}

function getMovementType() {
	return mov;
}

/**
 * Generate 4D chess position
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param input_position - If this is a position string, populate all 2D boards with it. If it is a dictionary, populate the boards according to it
 * @returns 
 */
function gen4DPosition(boards_x: number, boards_y: number, board_spacing: number, input_position?: string | {[key: string] : string}) {

	set4DBoardDimensions(boards_x, boards_y, board_spacing);
	const resultPos: Position = {};

	// position is string and should identically populate all 2D boards
	if (typeof input_position === 'string') {
		const input_position_long : Position = formatconverter.ShortToLong_Format(input_position).startingPosition;
		
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim.MIN_X; i <= dim.MAX_X; i++) {
			for (let j = dim.MIN_Y; j <= dim.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if ((i % dim.BOARD_SPACING === 0 || i % dim.BOARD_SPACING === 9)
					|| (j % dim.BOARD_SPACING === 0 || j % dim.BOARD_SPACING === 9)) {
					resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
					// Add input_position_long to the board
					if ((i < dim.MAX_X) && (i % dim.BOARD_SPACING === 0) && (j < dim.MAX_Y) && (j % dim.BOARD_SPACING === 0)) {
						for (const key in input_position_long) {
							const coords = coordutil.getCoordsFromKey(key as CoordsKey);
							const newKey = coordutil.getKeyFromCoords([coords[0] + i, coords[1] + j]);
							resultPos[newKey] = input_position_long[key as CoordsKey]!;
						}
					}
				}
			}
		}
	}
	// position is object and should populate 2D boards according to its entries
	else if (typeof input_position === 'object') {
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim.MIN_X; i <= dim.MAX_X; i++) {
			for (let j = dim.MIN_Y; j <= dim.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if ((i % dim.BOARD_SPACING === 0 || i % dim.BOARD_SPACING === 9)
					|| (j % dim.BOARD_SPACING === 0 || j % dim.BOARD_SPACING === 9)) {
					resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
					// Add the subposition to the correct board
					if ((i < dim.MAX_X) && (i % dim.BOARD_SPACING === 0) && (j < dim.MAX_Y) && (j % dim.BOARD_SPACING === 0)) {
						const sub_position_short = input_position[`${Math.floor(i / dim.BOARD_SPACING)},${Math.floor(j / dim.BOARD_SPACING)}`];
						const sub_position_long = (sub_position_short ? formatconverter.ShortToLong_Format(sub_position_short).startingPosition : {});
						for (const key in sub_position_long) {
							const coords = coordutil.getCoordsFromKey(key as CoordsKey);
							const newKey = coordutil.getKeyFromCoords([coords[0] + i, coords[1] + j]);
							resultPos[newKey] = sub_position_long[key as CoordsKey]!;
						}
					}
				}
			}
		}
	}

	return resultPos;
}

/**
 * Generates the moveset for the sliding pieces
 * @param boards_x - Number of 2D boards in x direction
 * @param boards_y - Number of 2D boards in y direction
 * @param board_spacing - The spacing of the 2D boards - should be equal to (sidelength of a 2D board) + 1
 * @param strong_kings_and_queens - true: allow quadragonal and triagonal movement. false: do not allow it
 * @param strong_pawns - true: pawns can capture along any diagonal. false: pawns can only capture along strictly spacelike or timelike diagonals
 * @returns 
 */
function gen4DMoveset(boards_x: number, boards_y: number, board_spacing: number, strong_kings_and_queens: boolean, strong_pawns: boolean) {

	set4DBoardDimensions(boards_x, boards_y, board_spacing);
	setMovementType(strong_kings_and_queens, strong_pawns);

	const movesets: Movesets = {
		queens: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > dim.MIN_X && endCoords[0] < dim.MAX_X && endCoords[1] > dim.MIN_Y && endCoords[1] < dim.MAX_Y);
			}
		},
		bishops: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > dim.MIN_X && endCoords[0] < dim.MAX_X && endCoords[1] > dim.MIN_Y && endCoords[1] < dim.MAX_Y);
			}
		},
		rooks: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > dim.MIN_X && endCoords[0] < dim.MAX_X && endCoords[1] > dim.MIN_Y && endCoords[1] < dim.MAX_Y);
			}
		},
		kings: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalKingMove
		},
		knights: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalKnightMove
		},
		pawns: {
			individual: [],
			special: fourdimensionalmoves.fourDimensionalPawnMove
		}
	};

	for (let baseH = 1; baseH >= -1; baseH--) {
		for (let baseV = 1; baseV >= -1; baseV--) {
			for (let offsetH = 1; offsetH >= -1; offsetH--) {
				for (let offsetV = 1; offsetV >= -1; offsetV--) {
					const x = (dim.BOARD_SPACING * baseH + offsetH);
					const y = (dim.BOARD_SPACING * baseV + offsetV);

					if (x < 0) continue; // If the x coordinate is negative, skip this iteration
					if (x === 0 && y <= 0) continue; // Skip if x is 0 and y is negative
					// Add the moves

					// allow any queen move if STRONG_KINGS_AND_QUEENS, else group her with bishops and rooks
					if (mov.STRONG_KINGS_AND_QUEENS) movesets['queens']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					
					// Only add a bishop move if the move moves in two dimensions
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 2) {
						movesets['bishops']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
						if (!mov.STRONG_KINGS_AND_QUEENS) movesets['queens']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					}
					// Only add a rook move if the move moves in one dimension
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 1) {
						movesets['rooks']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
						if (!mov.STRONG_KINGS_AND_QUEENS) movesets['queens']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					}
				}
			}
		}
	}

	return movesets;
}

export default {
	get4DBoardDimensions,
	gen4DPosition,
	gen4DMoveset,
	getMovementType
};