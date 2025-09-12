
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
import boardtiles from "./boardtiles.js";
import bounds, { DoubleBoundingBox } from "../../util/math/bounds.js";
import { createModel } from "./buffermodel.js";




/**
 * Draws a square on screen containing the entire
 * playable area, just inside the world border.
 */
function drawPlayableRegionMask(boardsim: Board): void {
	// No border, and in perspective mode => This is the best mask we can get!
	// This is crucial for making as if the board goes infinitely into the horizon.
	// Otherwise without this the solid cover isn't visible.
	if (!boardsim.playableRegion && perspective.getEnabled()) return boardtiles.renderSolidCover();

	const screenBox = camera.getRespectiveScreenBox();

	let worldBox: DoubleBoundingBox;
	if (boardsim.playableRegion) {

		const boundingBoxBD = meshes.expandTileBoundingBoxToEncompassWholeSquare(boardsim.playableRegion);
		worldBox = meshes.applyWorldTransformationsToBoundingBox(boundingBoxBD);

		// Cap the world box to the screen box.
		// Fixes graphical glitches when the vertex data is beyond float32 range.
		if (worldBox.left < screenBox.left) worldBox.left = screenBox.left;
		if (worldBox.right > screenBox.right) worldBox.right = screenBox.right;
		if (worldBox.bottom < screenBox.bottom) worldBox.bottom = screenBox.bottom;
		if (worldBox.top > screenBox.top) worldBox.top = screenBox.top;

		if (bounds.areBoxesDisjoint(worldBox, screenBox)) return; // No need to draw if playable area not on screen
	} else {
		// No world border, just use the screen box
		worldBox = screenBox;
	}

	const { left, right, bottom, top } = worldBox;
	const vertexData = primitives.Quad_Color(left, bottom, right, top, [0,0,0,1]); // Color doesn't matter since it's a mask

	createModel(vertexData, 2, 'TRIANGLES', true).render();
}


// Exports -------------------------------------


export default {
	drawPlayableRegionMask,
};