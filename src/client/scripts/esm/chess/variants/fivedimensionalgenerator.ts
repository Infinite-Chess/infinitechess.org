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
import { rawTypes } from "../config.js";


const BOARDS_X = 8;
const BOARDS_Y = 8;

/**
 * The spacing of the timelike boards.
 * Currently board spacings other than 10 are not supported by the position generator, but are supported by the moveset generator.
 */
const BOARD_SPACING = 10;

const MIN_X = 0;
const MAX_X = MIN_X + BOARDS_X * BOARD_SPACING - 1;
const MIN_Y = 0;
const MAX_Y = MIN_Y + BOARDS_Y * BOARD_SPACING - 1;

/**
 * The width of the giant void wall.
 * Large enough to contain all knights.
 */
const VOID_WIDTH = 20;



function genPositionOfFiveDimensional() {
	// Start with standard
	const standardPosStr = 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+';

	// Store the standard position so we can reference it later
	const standardPos: Position = formatconverter.ShortToLong_Format(standardPosStr).startingPosition;
	const resultPos: Position = {};

	// Loop through from the leftmost column that should be voids to the right most, and also vertically
	for (let i = MIN_X; i <= MAX_X; i++) {
		for (let j = MIN_Y; j <= MAX_Y; j++) {
			// Only the edges of boards should be voids
			if ((i % BOARD_SPACING === 0 || i % BOARD_SPACING === 9)
				|| (j % BOARD_SPACING === 0 || j % BOARD_SPACING === 9)) {
				resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
				// Only add the standard position in a board
				if ((i % BOARD_SPACING === 0) && (j % BOARD_SPACING === 0)) {
					for (const key in standardPos) {
						const coords = coordutil.getCoordsFromKey(key as CoordsKey);
						const newKey = coordutil.getKeyFromCoords([coords[0] + i, coords[1] + j]);
						resultPos[newKey] = standardPos[key as CoordsKey]!;
					}
				}
			}
		}
	}

	// Surround the whole game with a giant void wall
	for (let i = MIN_X - VOID_WIDTH; i <= MAX_X + VOID_WIDTH; i++) {
		for (let j = MIN_Y - VOID_WIDTH; j <= MAX_Y + VOID_WIDTH; j++) {
			if (i < MIN_X || i > MAX_X || j < MIN_Y || j > MAX_Y) {
				resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
			}
		}
	}

	return resultPos;
}

function genMovesetOfFiveDimensional() {
	const movesets: Movesets = {
		[rawTypes.QUEEN]: {
			individual: [],
			sliding: {}
		},
		[rawTypes.BISHOP]: {
			individual: [],
			sliding: {}
		},
		[rawTypes.ROOK]: {
			individual: [],
			sliding: {}
		},
		[rawTypes.KING]: {
			individual: [],
			special: specialdetect.kings // Makes sure legal castling is still calculated
		},
		[rawTypes.KNIGHT]: {
			individual: []
		},
		[rawTypes.PAWN]: {
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
					movesets[rawTypes.KING]!.individual[kingIndex] = [x, y];
					kingIndex++;
					if (x < 0) continue; // If the x coordinate is negative, skip this iteration
					if (x === 0 && y <= 0) continue; // Skip if x is 0 and y is negative
					// Add the moves
					movesets[rawTypes.QUEEN]!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					// Only add a bishop move if the move moves in two dimensions
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 2) {
						movesets[rawTypes.BISHOP]!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
					}
					// Only add a rook move if the move moves in one dimension
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 1) {
						movesets[rawTypes.ROOK]!.sliding![coordutil.getKeyFromCoords([x, y])] = [-Infinity, Infinity];
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
						movesets[rawTypes.KNIGHT]!.individual[knightIndex] = [BOARD_SPACING * baseH + offsetH, BOARD_SPACING * baseV + offsetV];
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