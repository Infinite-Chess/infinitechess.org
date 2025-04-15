

import board from './board.js';
import movement from './movement.js';
import { createModel } from './buffermodel.js';
import gameslot from '../chess/gameslot.js';
import jsutil from '../../util/jsutil.js';
import { players } from '../../chess/util/typeutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';


/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/** This script handles the rendering of our promotion lines. */

/** How many tiles on both ends the promotion lines should extend past the farthest piece */
const extraLength = 2; // Default: 4
const thickness = 0.010;

function render() {
	if (gameslot.getGamefile().gameRules.promotionRanks === undefined) return; // No promotion ranks in this game
	const model = initModel();

	const boardPos = movement.getBoardPos();
	const position = [
        -boardPos[0], // Add the model's offset
        -boardPos[1],
        0
    ];
	const boardScale = movement.getBoardScale();
	const scale = [boardScale, boardScale, 1];
	// render.renderModel(model, position, scale, "TRIANGLES")
	model.render(position, scale);
}

/**
 * Generates the buffer model of the promotion lines
 * 
 * TODO: Make the lines more clear as to what side they belong to and what
 * square you need to reach. Perhaps a color gradient? Perhaps it glows
 * brighter when you have a pawn selected?
 * 
 * This also needs to be centered with the pieces.
 * @returns {BufferModel} The buffer model
 */
function initModel() {
	const squareCenter = board.gsquareCenter();

	const gamefile = gameslot.getGamefile();
	const startPositionBox = gamefileutility.getStartingAreaBox(gamefile);

	const startX = startPositionBox.left - squareCenter - extraLength;
	const endX = startPositionBox.right + 1 - squareCenter + extraLength;

	const color = [0,0,0,1];

	const vertexData = [];

	addDataForSide(gamefile.gameRules.promotionRanks[players.WHITE], 1);
	addDataForSide(gamefile.gameRules.promotionRanks[players.BLACK], 0);

	function addDataForSide(ranks, zeroOrOne) {
		ranks.forEach(rank => {
			const yLow = rank + zeroOrOne - squareCenter - thickness;
			const yHigh = rank + zeroOrOne - squareCenter + thickness;
			vertexData.push(
				startX, yLow,   ...color,
				startX, yHigh,  ...color,
				endX, yLow,     ...color,
				endX, yLow,     ...color,
				startX, yHigh,  ...color,
				endX, yHigh,    ...color,
			);
		});
	}

	return createModel(vertexData, 2, "TRIANGLES", true);
}

export default {
	initModel,
	render
};