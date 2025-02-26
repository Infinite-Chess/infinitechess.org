/* eslint-disable max-depth */

/**
 * This script generates the position and piece movesets for the 5D Chess variant.
 */

import type { Movesets } from "../logic/movesets.js";
import type { Position } from "./variant.js";
import type { Coords, CoordsKey } from "../util/coordutil.js";


import coordutil from "../util/coordutil.js";
import fivedimensionalmoves from "../logic/fivedimensionalmoves.js";
// @ts-ignore
import formatconverter from "../logic/formatconverter.js";
// @ts-ignore
import specialdetect from "../logic/specialdetect.js";
import math from "../../util/math.js";

/**
 * BOARD_SPACING: The spacing of the timelike boards.
 */

function genPositionOfFiveDimensional(BOARDS_X: number, BOARDS_Y: number, BOARD_SPACING: number, repeat_position?: string) {
	const MIN_X = 0;
	const MAX_X = MIN_X + BOARDS_X * BOARD_SPACING;
	const MIN_Y = 0;
	const MAX_Y = MIN_Y + BOARDS_Y * BOARD_SPACING;

	const resultPos: Position = {};

	if (repeat_position) {
		const repeat_position_long : Position = formatconverter.ShortToLong_Format(repeat_position).startingPosition;
		
		// Loop through from the leftmost column that should be voids to the right most, and also vertically
		for (let i = MIN_X; i <= MAX_X; i++) {
			for (let j = MIN_Y; j <= MAX_Y; j++) {
				// Only the edges of boards should be voids
				if ((i % BOARD_SPACING === 0 || i % BOARD_SPACING === 9)
					|| (j % BOARD_SPACING === 0 || j % BOARD_SPACING === 9)) {
					resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
					// Only add the standard position in a board
					if ((i < MAX_X) && (i % BOARD_SPACING === 0) && (j < MAX_Y) && (j % BOARD_SPACING === 0)) {
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

function genMovesetOfFiveDimensional(BOARDS_X: number, BOARDS_Y: number, BOARD_SPACING: number) {
	const MIN_X = 0;
	const MAX_X = MIN_X + BOARDS_X * BOARD_SPACING;
	const MIN_Y = 0;
	const MAX_Y = MIN_Y + BOARDS_Y * BOARD_SPACING;

	const movesets: Movesets = {
		queens: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > MIN_X && endCoords[0] < MAX_X && endCoords[1] > MIN_Y && endCoords[1] < MAX_Y);
			}
		},
		bishops: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > MIN_X && endCoords[0] < MAX_X && endCoords[1] > MIN_Y && endCoords[1] < MAX_Y);
			}
		},
		rooks: {
			individual: [],
			sliding: {},
			ignore: (startCoords: Coords, endCoords: Coords) => {
				return (endCoords[0] > MIN_X && endCoords[0] < MAX_X && endCoords[1] > MIN_Y && endCoords[1] < MAX_Y);
			}
		},
		kings: {
			individual: [],
			special: specialdetect.kings // Makes sure legal castling is still calculated
		},
		knights: {
			individual: [],
			ignore: (startCoords: Coords, endCoords: Coords) => {
				const distance = math.manhattanDistance(startCoords, endCoords);
				return (distance === 3) && ((startCoords[0] % BOARD_SPACING !== endCoords[0] % BOARD_SPACING) || (startCoords[1] % BOARD_SPACING !== endCoords[1] % BOARD_SPACING));
			}
		},
		pawns: {
			individual: [],
			special: fivedimensionalmoves.fivedimensionalpawnmove
		}
	};
	let kingIndex = 0;
	for (let baseH = 1; baseH >= -1; baseH--) {
		for (let baseV = 1; baseV >= -1; baseV--) {
			for (let offsetH = 1; offsetH >= -1; offsetH--) {
				for (let offsetV = 1; offsetV >= -1; offsetV--) {
					const x = (BOARD_SPACING * baseH + offsetH);
					const y = (BOARD_SPACING * baseV + offsetV);
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

	// Knights are special, since they can move two tiles in one dimension
	let knightIndex = 0;
	for (let baseH = 2; baseH >= -2; baseH--) {
		for (let baseV = 2; baseV >= -2; baseV--) {
			for (let offsetH = 2; offsetH >= -2; offsetH--) {
				for (let offsetV = 2; offsetV >= -2; offsetV--) {
					// If the squared distance to the tile is 5, then add the move
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 5) {
						movesets['knights']!.individual[knightIndex] = [BOARD_SPACING * baseH + offsetH, BOARD_SPACING * baseV + offsetV];
						knightIndex++;
					}
				}
			}
		}
	}

	return movesets;
}



export default {
	genPositionOfFiveDimensional,
	genMovesetOfFiveDimensional
};