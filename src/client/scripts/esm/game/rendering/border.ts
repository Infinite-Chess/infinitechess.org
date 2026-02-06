// src/client/scripts/esm/game/rendering/border.ts

/**
 * This script renders the border, and star field
 * animation of games with a world border.
 */

// prettier-ignore
import bounds, { BoundingBox, DoubleBoundingBox, UnboundedRectangle, } from '../../../../../shared/util/math/bounds.js';

import meshes from './meshes.js';
import camera from './camera.js';
import primitives from './primitives.js';
import boardtiles from './boardtiles.js';
import perspective from './perspective.js';
import { createRenderable } from '../../webgl/Renderable.js';

/**
 * Draws a square on screen containing the entire
 * playable area, just inside the world border.
 */
function drawPlayableRegionMask(worldBorder: UnboundedRectangle | undefined): void {
	// No border, and in perspective mode => This is the best mask we can get!
	// This is crucial for making as if the board goes infinitely into the horizon.
	// Otherwise without this the solid cover isn't visible.
	if (!worldBorder && perspective.getEnabled()) return boardtiles.renderSolidCover();

	const screenBox = camera.getRespectiveScreenBox();

	let worldBox: DoubleBoundingBox;
	if (worldBorder) {
		// 0n works because, below, if the sides are at infinity anyway, they get capped to the screen box. The intermediate worldBox makes no difference to the final result for those sides.
		const worldBorderNotNull: BoundingBox = {
			left: worldBorder.left ?? 0n,
			right: worldBorder.right ?? 0n,
			bottom: worldBorder.bottom ?? 0n,
			top: worldBorder.top ?? 0n,
		};
		const boundingBoxBD =
			meshes.expandTileBoundingBoxToEncompassWholeSquare(worldBorderNotNull);
		worldBox = meshes.applyWorldTransformationsToBoundingBox(boundingBoxBD);

		// Cap the world box to the screen box.
		// Fixes graphical glitches when the vertex data is beyond float32 range.
		if (worldBorder.left === null || worldBox.left < screenBox.left)
			worldBox.left = screenBox.left;
		if (worldBorder.right === null || worldBox.right > screenBox.right)
			worldBox.right = screenBox.right;
		if (worldBorder.bottom === null || worldBox.bottom < screenBox.bottom)
			worldBox.bottom = screenBox.bottom;
		if (worldBorder.top === null || worldBox.top > screenBox.top) worldBox.top = screenBox.top;

		if (bounds.areBoxesDisjoint(worldBox, screenBox)) return; // No need to draw if playable area not on screen
	} else {
		// No world border, just use the screen box
		worldBox = screenBox;
	}

	const { left, right, bottom, top } = worldBox;
	const vertexData = primitives.Quad_Color(left, bottom, right, top, [0, 0, 0, 1]); // Color doesn't matter since it's a mask

	createRenderable(vertexData, 2, 'TRIANGLES', 'color', true).render();
}

// Exports -------------------------------------

export default {
	drawPlayableRegionMask,
};
