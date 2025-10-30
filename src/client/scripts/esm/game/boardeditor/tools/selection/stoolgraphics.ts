
// src/client/scripts/esm/game/boardeditor/tools/selection/stoolgraphics.ts

/**
 * Selection Tool Graphics
 * 
 * Contains the methods for rendering the graphics
 * of the Selection Tool in the Board Editor
 */

import type { Coords } from "../../../../../../../shared/chess/util/coordutil";

import mouse from "../../../../util/mouse";
import camera from "../../../rendering/camera";
import meshes from "../../../rendering/meshes";
import { createRenderable } from "../../../../webgl/Renderable";


/**
 * Outlines the current rank and file of the square
 * the mouse is currently hovering over, for a total of 4 lines.
 */
function outlineRankAndFile(): void {
	// Determine what square the mouse is hovering over
	const currentTile: Coords | undefined = mouse.getTileMouseOver_Integer();
	if (!currentTile) return;

	// The coordinates of the edges of the square
	const { left, right, bottom, top } = meshes.getCoordBoxWorld(currentTile);

	const data: number[] = [];

	// Deep brown/maroon color
	// const color = [0.36, 0.2, 0.09, 1];
	const color = [0, 0, 0, 1];

	const screenBox = camera.getRespectiveScreenBox();

	data.push(
		// Horizontal: Lower
		screenBox.left, bottom,   ...color,
		screenBox.right, bottom,  ...color,
		// Horizontal: Upper
		screenBox.left, top,      ...color,
		screenBox.right, top,     ...color,
		// Vertical: Lefter
		left, screenBox.bottom,   ...color,
		left, screenBox.top,      ...color,
		// Vertical: Righter
		right, screenBox.bottom,  ...color,
		right, screenBox.top,     ...color,
	);

	createRenderable(data, 2, "LINES", 'color', true).render();
}


export default {
	outlineRankAndFile,
};