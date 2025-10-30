
// src/client/scripts/esm/game/boardeditor/tools/selection/stoolgraphics.ts

/**
 * Selection Tool Graphics
 * 
 * Contains the methods for rendering the graphics
 * of the Selection Tool in the Board Editor
 */

import type { Coords } from "../../../../../../../shared/chess/util/coordutil";
import type { BoundingBox, BoundingBoxBD, DoubleBoundingBox } from "../../../../../../../shared/util/math/bounds";
import type { Color } from "../../../../../../../shared/util/math/math";

import mouse from "../../../../util/mouse";
import camera from "../../../rendering/camera";
import meshes from "../../../rendering/meshes";
import primitives from "../../../rendering/primitives";
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

	const color = [0, 0, 0, 1]; // Black

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

/**
 * Renders a wireframe box around the selection
 * @param startPoint - First corner of the selection
 * @param endPoint - Opposite corner of the selection
 */
function renderSelectionBox(startPoint: Coords, endPoint: Coords): void {
	const intBox: BoundingBox = {
		left: startPoint[0] < endPoint[0] ? startPoint[0] : endPoint[0],
		right: startPoint[0] > endPoint[0] ? startPoint[0] : endPoint[0],
		bottom: startPoint[1] < endPoint[1] ? startPoint[1] : endPoint[1],
		top: startPoint[1] > endPoint[1] ? startPoint[1] : endPoint[1],
	};

	// Moves the edges of the box outward to encapsulate the entirity of the squares, instead of just the centers.
	const roundedAwayBox: BoundingBoxBD = meshes.expandTileBoundingBoxToEncompassWholeSquare(intBox);

	// Convert it to a world-space box
	const worldBox: DoubleBoundingBox = meshes.applyWorldTransformationsToBoundingBox(roundedAwayBox);

	// Construct the wireframe data and render it
	const color: Color = [0, 0, 0, 1]; // Black
	const data: number[] = primitives.Rect(worldBox.left, worldBox.bottom, worldBox.right, worldBox.top, color);
	createRenderable(data, 2, "LINE_LOOP", 'color', true).render();

	// Also construct the semi-transparent fill data and render it
	const fillColor: Color = [0, 0, 0, 0.08]; // Transparent Black
	const fillData: number[] = primitives.Quad_Color(worldBox.left, worldBox.bottom, worldBox.right, worldBox.top, fillColor);
	createRenderable(fillData, 2, "TRIANGLES", 'color', true).render();
}


export default {
	outlineRankAndFile,
	renderSelectionBox,
};