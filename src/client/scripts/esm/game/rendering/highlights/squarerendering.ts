
// src/client/scripts/esm/game/rendering/highlights/squarerendering.ts

/**
 * This script knows how to generate buffer
 * models for rendering square highlights, such as:
 * 
 * * Last move highlight
 * * Square annotations
 * * Premove highlights
 */


import space from "../../misc/space.js";
import instancedshapes from "../instancedshapes.js";
import bd from "../../../../../../shared/util/bigdecimal/bigdecimal.js";
import { BufferModelInstanced, createModel_Instanced } from "../buffermodel.js";

import type { Coords } from "../../../../../../shared/chess/util/coordutil.js";
import type { Color } from "../../../../../../shared/util/math/math.js";


/**
 * Generates a renderable buffer model for square highlights from given coordinates.
 * Doesn't require any position or scale tranformations before rendering, you can just call
 * `.render(undefined, undefined, { u_size: boardpos.getBoardScaleAsNumber() });` on the returned model.
 * 
 * This type of model requires regeneration every single frame, so don't use it
 * if you have an arbitrary number of squares to render.
 */
function genModel(highlights: Coords[], color: Color): BufferModelInstanced {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	highlights.forEach(coords => {
		// const worldLoc = space.convertCoordToWorldSpace_IgnoreSquareCenter(bigdecimal.FromCoords(coords));
		const worldLoc = space.convertCoordToWorldSpace(bd.FromCoords(coords));
		instanceData.push(...worldLoc);
	});

	return createModel_Instanced(vertexData, instanceData, 'TRIANGLES', 'highlights', true);
}


export default {
	genModel,
};