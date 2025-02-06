'use strict';

// Import Start
import colorutil from "../util/colorutil.js";
import { BOARDS_X, BOARDS_Y } from '../variants/fivedimensionalgenerator.js';
// Import End


/**
 * Returns true if a pawn should promote in the Five Dimensional variant
 * @param {gamefile} gamefile
 * @param {string} type
 * @param {number[]} coordsClicked
 * @returns {boolean}
 */
function fivedimensionalpromote(gamefile, type, coordsClicked) {
	const color = colorutil.getPieceColorFromType(type);
	if (color === undefined) throw new Error("Pawn must have a valid color.");
	const promotionRanks = color === 'white' ? [8, 18, 28, -2, -12] : [1, 11, 21, -9, -19];

	return (promotionRanks.includes(coordsClicked[1]));
}

export default {
	fivedimensionalpromote
};