
// Import Start
import board from './board.js';
import game from '../chess/game.js';
import movement from './movement.js';
import buffermodel from './buffermodel.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/** This script handles the rendering of our promotion lines. */

const startEnd = [-3, 12];
const thickness = 0.010;

function render() {
	if (!game.getGamefile().gameRules.promotionRanks) return; // No promotion ranks in this game
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
	const startX = startEnd[0] - board.gsquareCenter();
	const endX = startEnd[1] + 1 - board.gsquareCenter();

	const gamefile = game.getGamefile();
    
	const yLow1 = gamefile.gameRules.promotionRanks[0] + 1 - board.gsquareCenter() - thickness;
	const yHigh1 = gamefile.gameRules.promotionRanks[0] + 1 - board.gsquareCenter() + thickness;

	const yLow2 = gamefile.gameRules.promotionRanks[1] - board.gsquareCenter() - thickness;
	const yHigh2 = gamefile.gameRules.promotionRanks[1] - board.gsquareCenter() + thickness;

	const data = new Float32Array([
        // x      y             r g b a
        startX, yLow1,        0, 0, 0,  1,
        startX, yHigh1,       0, 0, 0,  1,
        endX, yLow1,          0, 0, 0,  1,
        endX, yLow1,          0, 0, 0,  1,
        startX, yHigh1,       0, 0, 0,  1,
        endX, yHigh1,         0, 0, 0,  1,

        startX, yLow2,        0, 0, 0,  1,
        startX, yHigh2,       0, 0, 0,  1,
        endX, yLow2,          0, 0, 0,  1,
        endX, yLow2,          0, 0, 0,  1,
        startX, yHigh2,       0, 0, 0,  1,
        endX, yHigh2,         0, 0, 0,  1,
    ]);

	// return buffermodel.createModel_Color(data)
	return buffermodel.createModel_Colored(data, 2, "TRIANGLES");
}

export default {
	initModel,
	render
};