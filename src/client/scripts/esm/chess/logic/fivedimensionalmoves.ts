'use strict';

// Import Start
import colorutil from "../util/colorutil.js";
import { BOARDS_X, BOARDS_Y } from '../variants/fivedimensionalgenerator.js';
import gamefile from "./gamefile.js";
import { Coords } from "./movesets.js";
// Import End


/**
 * Returns true if a pawn should promote in the Five Dimensional variant
 * @param {gamefile} gamefile
 * @param {string} type
 * @param {number[]} coordsClicked
 * @returns {boolean}
 */
function fivedimensionalpromote(gamefile: gamefile, type: string, coordsClicked: Coords): boolean {
	const color = colorutil.getPieceColorFromType(type);
	if (color === undefined) throw new Error("Pawn must have a valid color.");
	const promotionRanks: number[] = [];
	for (let i = -Math.floor(BOARDS_X / 2); i <= Math.floor(BOARDS_X / 2); i++) {
		promotionRanks.push(1 - 10 * i);
	}
	if (color === "white") {
		promotionRanks.map(value => value + 7);
	}

	return (promotionRanks.includes(coordsClicked[1]));
}

export default {
	fivedimensionalpromote
};