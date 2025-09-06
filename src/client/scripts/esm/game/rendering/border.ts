
// src/client/scripts/esm/game/rendering/border.ts

/**
 * This script renders the border, and star field
 * animation of games with a world border.
 */


import type { Board } from "../../chess/logic/gamefile.js";

import meshes from "./meshes.js";
import { createModel } from "./buffermodel.js";




/**
 * Draws a square on screen containing the entire
 * playable area, just inside the world border.
 */
function drawPlayableRegionMask(boardsim: Board): void {
	const vertexData = meshes.RectWorld_Filled(boardsim.playableRegion!, [1,0,0,1]);

	createModel(vertexData, 2, 'TRIANGLES', true).render();
}


// Exports -------------------------------------


export default {
	drawPlayableRegionMask,
};