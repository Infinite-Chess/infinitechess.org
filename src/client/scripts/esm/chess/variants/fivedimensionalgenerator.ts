/* eslint-disable max-depth */
// @ts-ignore
import formatconverter from "../logic/formatconverter.js";
// @ts-ignore
import coordutil from "../util/coordutil.js";

// Type definitions...

import type { Movesets } from "../logic/movesets.js";
import type { Position } from "./variant.js";



'use strict';

const BOARDS_X = 11;
const BOARDS_Y = 11;

// Currently board spacings other than 10 are not supported by the position generator, but are supported
// by the moveset generator.
const BOARD_SPACING = 10;

const MAX_X = BOARD_SPACING * (Math.floor(BOARDS_X / 2) + 1);
const MIN_X = -(BOARD_SPACING * Math.floor(BOARDS_X / 2) + 1);

const MAX_Y = BOARD_SPACING * (Math.floor(BOARDS_Y / 2) + 1);
const MIN_Y = -(BOARD_SPACING * Math.floor(BOARDS_Y / 2) + 1);

function genPositionOfFiveDimensional() {
	// Start with standard
	const standardPosStr = 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+';

	// Store the standard position so we can reference it later
	const standardPos = formatconverter.ShortToLong_Format(standardPosStr).startingPosition;

	const resultPos: Position = {};

	// Loop through from the leftmost column that should be voids to the right most, and also vertically
	for (let i = MIN_X; i <= MAX_X; i++) {
		for (let j = MIN_Y; j <= MAX_Y; j++) {
			// Only the edges of boards should be voids
			if ((i % BOARD_SPACING === -1 || i % BOARD_SPACING === 0 || i % BOARD_SPACING === 9)
				|| (j % BOARD_SPACING === -1 || j % BOARD_SPACING === 0 || j % BOARD_SPACING === 9)) {
				resultPos[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
				// Only add the standard position in a board
				if ((i % BOARD_SPACING === 0) && (j % BOARD_SPACING) === 0
					&& i !== MAX_X && j !== MAX_Y) {
					for (const square in standardPos) {
						resultPos[coordutil.getKeyFromCoords(coordutil.getCoordsFromKey(square).map((value: number, index: number) => {
							return value + [i, j][index]!;
						}))] = standardPos[square];
					}
				}
			}
		}
	}

	return resultPos;
}

function genMovesetOfFiveDimensional() {
	const movesets: Movesets = {
		queens: {
			individual: [],
			sliding: {}
		},
		bishops: {
			individual: [],
			sliding: {}
		},
		rooks: {
			individual: [],
			sliding: {}
		},
		kings: {
			individual: []
		},
		knights: {
			individual: []
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