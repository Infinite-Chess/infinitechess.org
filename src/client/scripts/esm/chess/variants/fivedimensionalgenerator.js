/* eslint-disable max-depth */
import formatconverter from "../logic/formatconverter.js";
import coordutil from "../util/coordutil.js";

'use strict';

function genPositionOfFiveDimensional() {
	const standardPosStr = 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+';

	const standardPos = formatconverter.ShortToLong_Format(standardPosStr).startingPosition;
	const result = { ...standardPos };

	const BOARDS_X = 7;
	const BOARDS_Y = 5;

	for (let i = -(10 * Math.floor(BOARDS_X / 2) + 1); i <= 10 * (Math.floor(BOARDS_X / 2) + 1); i++) {
		for (let j = -(10 * Math.floor(BOARDS_Y / 2) + 1); j <= 10 * (Math.floor(BOARDS_Y / 2) + 1); j++) {
			if ((i % 10 === -1 || i % 10 === 0 || i % 10 === 9) || (j % 10 === -1 || j % 10 === 0 || j % 10 === 9)) {
				result[coordutil.getKeyFromCoords([i, j])] = 'voidsN';
			}
		}
	}

	return result;
}

function genMovesetOfFiveDimensional() {
	const moveset = {
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
		}
	};
	let kingIndex = 0;
	for (let baseH = -1; baseH <= 1; baseH++) {
		for (let baseV = -1; baseV <= 1; baseV++) {
			for (let offsetH = -1; offsetH <= 1; offsetH++) {
				for (let offsetV = -1; offsetV <= 1; offsetV++) {
					moveset.queens.sliding[`${(10 * baseH + offsetH).toString()},${(10 * baseV + offsetV).toString()}`] = [-Infinity, Infinity];
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 2) {
						moveset.bishops.sliding[`${(10 * baseH + offsetH).toString()},${(10 * baseV + offsetV).toString()}`] = [-Infinity, Infinity];
					}
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 1) {
						moveset.rooks.sliding[`${(10 * baseH + offsetH).toString()},${(10 * baseV + offsetV).toString()}`] = [-Infinity, Infinity];
					}
					moveset.kings.individual[kingIndex] = [10 * baseH + offsetH, 10 * baseV + offsetV];
					kingIndex++;
				}
			}
		}
	}
	console.log(moveset);
	return moveset;
}

export default {
	genPositionOfFiveDimensional,
	genMovesetOfFiveDimensional
};