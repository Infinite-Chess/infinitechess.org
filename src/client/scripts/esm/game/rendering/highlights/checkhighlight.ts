
/**
 * This script renders the red glow surrounding
 * royal pieces currently in check.
 */

import space from '../../misc/space.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import preferences from '../../../components/header/preferences.js';
import boardpos from '../boardpos.js';
import bd from '../../../../../../shared/util/bigdecimal/bigdecimal.js';
import primitives from '../primitives.js';
import { BufferModel, createModel } from '../../../webgl/buffermodel.js';


// Type Definitions ----------------------------------------------------------------


import type { Board } from '../../../../../../shared/chess/logic/gamefile.js';
import type { BDCoords, Coords } from '../../../../../../shared/chess/util/coordutil.js';
import type { Color } from '../../../../../../shared/util/math/math.js';


// Functions -----------------------------------------------------------------------


/**
 * Renders the red glow around all pieces in check on the currently-viewed move.
 */
function render(boardsim: Board): void {
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
	const colorOfPerimeter: Color = [color[0], color[1], color[2],  0]; // Same color, but zero opacity

	const outRad = 0.65 * boardpos.getBoardScaleAsNumber();
	const inRad = 0.3 * boardpos.getBoardScaleAsNumber();
	const resolution = 20;
    
	const data: number[] = [];
	for (let i = 0; i < royalsInCheck.length; i++) {
		const thisRoyalInCheckCoordsBD: BDCoords = bd.FromCoords(royalsInCheck[i]!);
		// This currently doesn't work for squareCenters other than 0.5. I will need to add + 0.5 - board.getSquareCenter()
		// Create a math function for returning the world-space point of the CENTER of the provided coordinate!
		const worldSpaceCoord = space.convertCoordToWorldSpace(thisRoyalInCheckCoordsBD);
		const x = worldSpaceCoord[0];
		const y = worldSpaceCoord[1];

		const dataCircle: number[] = primitives.Circle(x, y, inRad, resolution, color);
		const dataRing: number[] = primitives.Ring(x, y, inRad, outRad, resolution, color, colorOfPerimeter);
		data.push(...dataCircle);
		data.push(...dataRing);
	}

	return createModel(data, 2, "TRIANGLES", 'color', true);
}



export default {
	render
};