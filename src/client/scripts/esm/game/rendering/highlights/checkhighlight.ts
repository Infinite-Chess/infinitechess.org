
/**
 * This script renders the red glow surrounding
 * royal pieces currently in check.
 */

import space from '../../misc/space.js';
import gamefileutility from '../../../chess/util/gamefileutility.js';
import { BufferModel, createModel } from '../buffermodel.js';
import preferences from '../../../components/header/preferences.js';
import boardpos from '../boardpos.js';
// @ts-ignore
import bufferdata from '../bufferdata.js';


// Type Definitions ----------------------------------------------------------------

import type { Board } from '../../../chess/logic/gamefile.js';
import type { Coords } from '../../../chess/util/coordutil.js';

// Functions -----------------------------------------------------------------------


/**
 * Renders the red glow around all pieces in check on the currently-viewed move.
 */
function render(boardsim: Board) {
	const royalsInCheck = gamefileutility.getCheckCoordsOfCurrentViewedPosition(boardsim);
	if (royalsInCheck.length === 0) return; // Nothing in check
    
	const model = genCheckHighlightModel(royalsInCheck);
	model.render();
}

/**
 * Generates the buffer model of the red-glow around each royal piece currently in check.
 */
function genCheckHighlightModel(royalsInCheck: Coords[]): BufferModel {
	const color = preferences.getCheckHighlightColor(); // [r,g,b,a]
	const colorOfPerimeter: number[] = [color[0],color[1],color[2], 0]; // Same color, but zero opacity

	const outRad = 0.65 * boardpos.getBoardScale();
	const inRad = 0.3 * boardpos.getBoardScale();
	const resolution = 20;
    
	const data: number[] = [];
	for (let i = 0; i < royalsInCheck.length; i++) {
		const thisRoyalInCheckCoords = royalsInCheck[i]!;
		// This currently doesn't work for squareCenters other than 0.5. I will need to add + 0.5 - board.gsquareCenter()
		// Create a math function for returning the world-space point of the CENTER of the provided coordinate!
		const worldSpaceCoord = space.convertCoordToWorldSpace(thisRoyalInCheckCoords);
		const x = worldSpaceCoord[0];
		const y = worldSpaceCoord[1];

		const dataCircle: number[] = bufferdata.getDataCircle_TRIANGLES(x, y, inRad, resolution, color);
		const dataRing: number[] = bufferdata.getDataRing(x, y, inRad, outRad, resolution, color, colorOfPerimeter);
		data.push(...dataCircle);
		data.push(...dataRing);
	}

	return createModel(data, 2, "TRIANGLES", true);
}



export default {
	render
};