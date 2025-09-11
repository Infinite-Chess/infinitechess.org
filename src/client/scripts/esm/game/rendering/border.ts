
// src/client/scripts/esm/game/rendering/border.ts

/**
 * This script renders the border, and star field
 * animation of games with a world border.
 */


import type { Board } from "../../chess/logic/gamefile.js";

import meshes from "./meshes.js";
import camera from "./camera.js";
import primitives from "./primitives.js";
import perspective from "./perspective.js";
import bounds, { DoubleBoundingBox } from "../../util/math/bounds.js";
import { createModel } from "./buffermodel.js";




/**
 * Draws a square on screen containing the entire
 * playable area, just inside the world border.
 */
function drawPlayableRegionMask(boardsim: Board): void {
	const boundingBoxBD = meshes.expandTileBoundingBoxToEncompassWholeSquare(boardsim.playableRegion!);
	const worldBox = meshes.applyWorldTransformationsToBoundingBox(boundingBoxBD);

	const screenBox = camera.getRespectiveScreenBox();
	// Cap the world box to the screen box.
	// Fixes graphical glitches when the vertex data is beyond float32 range.
	if (worldBox.left < screenBox.left) worldBox.left = screenBox.left;
	if (worldBox.right > screenBox.right) worldBox.right = screenBox.right;
	if (worldBox.bottom < screenBox.bottom) worldBox.bottom = screenBox.bottom;
	if (worldBox.top > screenBox.top) worldBox.top = screenBox.top;

	if (bounds.areBoxesDisjoint(worldBox, screenBox)) return; // No need to draw if playable area not on screen

	const { left, right, bottom, top } = worldBox;
	const vertexData = primitives.Quad_Color(left, bottom, right, top, [0,0,0,1]); // Color doesn't matter since it's a mask

	createModel(vertexData, 2, 'TRIANGLES', true).render();
}


// Exports -------------------------------------


export default {
	drawPlayableRegionMask,
};