
// Import Start
import bufferdata from './bufferdata.js';
import game from '../chess/game.js';
import movement from './movement.js';
import options from './options.js';
import buffermodel from './buffermodel.js';
import space from '../misc/space.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/**
 * This script renders the red glow surrounding
 * royal pieces currently in check.
 */

function render() {
	if (!game.getGamefile().inCheck) return; // No check

	const royalsInCheck = game.getGamefile().inCheck;
    
	const model = genCheckHighlightModel(royalsInCheck);
	model.render();
}

/**
 * Generates the buffer model of the red-glow around each royal piece currently in check.
 * @param {number[]} royalsInCheck - A list of coordinates: `[x,y]`
 * @returns {BufferModel} The buffer model
 */
function genCheckHighlightModel(royalsInCheck) {
	const z = -0.005;
	const color = options.getDefaultCheckHighlightColor(); // [r,g,b,a]
    
	const data = [];
	for (let i = 0; i < royalsInCheck.length; i++) {
		const thisRoyalInCheckCoords = royalsInCheck[i];
		// const dataOfThisRoyal = bufferdata.getDataQuad_Color3D_FromCoord(thisRoyalInCheckCoords, z, color)
		// data.push(...dataOfThisRoyal)

		// This currently doesn't work for squareCenters other than 0.5. I will need to add + 0.5 - board.gsquareCenter()
		// Create a math function for returning the world-space point of the CENTER of the provided coordinate!
		const worldSpaceCoord = space.convertCoordToWorldSpace(thisRoyalInCheckCoords);
		const x = worldSpaceCoord[0];
		const y = worldSpaceCoord[1];
		const outRad = 0.65 * movement.getBoardScale();
		const inRad = 0.3 * movement.getBoardScale();
		const resolution = 20;

		const dataCircle = bufferdata.getDataCircle3D(x, y, z, inRad, resolution, ...color);
		const dataRing = bufferdata.getDataRing3D(x, y, z, inRad, outRad, resolution, ...color, color[0], color[1], color[2], 0);
		data.push(...dataCircle);
		data.push(...dataRing);
	}

	return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
}

export default {
	render
};