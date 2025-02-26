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
// @ts-ignore
import specialdetect from "../logic/specialdetect.js";

/**
 * dim: contains all relevant quantities for the size of the 4D chess board.
 * BOARD_SPACING: The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1.
 * BOARDS_X: number of 2D boards in x-direction.
 * BOARDS_Y: number of 2D boards in y-direction.
 * The rest designate the board edges on the real chessboard.
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

function gen4DPosition(boards_x: number, boards_y: number, board_spacing: number, repeat_position?: string) {

	set4DBoardDimensions(boards_x, boards_y, board_spacing);
	const resultPos: Position = {};

	if (repeat_position) {
		const repeat_position_long : Position = formatconverter.ShortToLong_Format(repeat_position).startingPosition;
		
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = dim.MIN_X; i <= dim.MAX_X; i++) {
			for (let j = dim.MIN_Y; j <= dim.MAX_Y; j++) {
				// Only the edges of boards should be voids
				if ((i % dim.BOARD_SPACING === 0 || i % dim.BOARD_SPACING === 9)
					|| (j % dim.BOARD_SPACING === 0 || j % dim.BOARD_SPACING === 9)) {
					resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
					// Only add the standard position in a board
					if ((i < dim.MAX_X) && (i % dim.BOARD_SPACING === 0) && (j < dim.MAX_Y) && (j % dim.BOARD_SPACING === 0)) {
						for (const key in repeat_position_long) {
							const coords = coordutil.getCoordsFromKey(key as CoordsKey);
							const newKey = coordutil.getKeyFromCoords([coords[0] + i, coords[1] + j]);
							resultPos[newKey] = repeat_position_long[key as CoordsKey]!;
						}
					}
				}
			}
		}
	}

	return resultPos;
}

function gen4DMoveset(boards_x: number, boards_y: number, board_spacing: number) {

	set4DBoardDimensions(boards_x, boards_y, board_spacing);

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
			special: specialdetect.kings // Makes sure legal castling is still calculated
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
	let kingIndex = 0;
	for (let baseH = 1; baseH >= -1; baseH--) {
		for (let baseV = 1; baseV >= -1; baseV--) {
			for (let offsetH = 1; offsetH >= -1; offsetH--) {
				for (let offsetV = 1; offsetV >= -1; offsetV--) {
					const x = (dim.BOARD_SPACING * baseH + offsetH);
					const y = (dim.BOARD_SPACING * baseV + offsetV);
					movesets['kings']!.individual[kingIndex] = [x, y];
					kingIndex++;
					if (x < 0) continue; // If the x coordinate is negative, skip this iteration
					if (x === 0 && y <= 0) continue; // Skip if x is 0 and y is negative
					// Add the moves
					movesets['queens']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					// Only add a bishop move if the move moves in two dimensions
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 2) {
						movesets['bishops']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					}
					// Only add a rook move if the move moves in one dimension
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 1) {
						movesets['rooks']!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
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
	gen4DMoveset
};