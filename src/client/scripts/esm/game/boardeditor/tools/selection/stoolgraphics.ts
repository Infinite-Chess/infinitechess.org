
// src/client/scripts/esm/game/boardeditor/tools/selection/stoolgraphics.ts

/**
 * Selection Tool Graphics
 * 
 * Contains the methods for rendering the graphics
 * of the Selection Tool in the Board Editor
 */

import type { Coords, DoubleCoords } from "../../../../../../../shared/chess/util/coordutil";
import type { DoubleBoundingBox } from "../../../../../../../shared/util/math/bounds";
import type { Color } from "../../../../../../../shared/util/math/math";

import mouse from "../../../../util/mouse";
import camera from "../../../rendering/camera";
import meshes from "../../../rendering/meshes";
import primitives from "../../../rendering/primitives";
import space from "../../../misc/space";
import { createRenderable } from "../../../../webgl/Renderable";



// Constants ---------------------------------------------------


/**
 * The color for the wireframe of the selection box, including the small square in the corner,
 * and the outline of the currently hovered square's rank & file, when there is no selection.
 */
const OUTLINE_COLOR: Color = [0,0,0, 1]; // Black
/** The fill color of the selection box. */
const FILL_COLOR: Color = [0,0,0, 0.08]; // Transparent Black


// Methods -----------------------------------------------------



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

	const screenBox = camera.getRespectiveScreenBox();

	data.push(
		// Horizontal: Lower
		screenBox.left, bottom,   ...OUTLINE_COLOR,
		screenBox.right, bottom,  ...OUTLINE_COLOR,
		// Horizontal: Upper
		screenBox.left, top,      ...OUTLINE_COLOR,
		screenBox.right, top,     ...OUTLINE_COLOR,
		// Vertical: Lefter
		left, screenBox.bottom,   ...OUTLINE_COLOR,
		left, screenBox.top,      ...OUTLINE_COLOR,
		// Vertical: Righter
		right, screenBox.bottom,  ...OUTLINE_COLOR,
		right, screenBox.top,     ...OUTLINE_COLOR,
	);

	createRenderable(data, 2, "LINES", 'color', true).render();
}

/**
 * Renders a wireframe box around the selection.
 * @param worldBox - Contains the world space edge coordinates of the selection box.
 */
function renderSelectionBoxWireframe(worldBox: DoubleBoundingBox): void {
	// Construct the wireframe data and render it
	const data: number[] = primitives.Rect(worldBox.left, worldBox.bottom, worldBox.right, worldBox.top, OUTLINE_COLOR);
	createRenderable(data, 2, "LINE_LOOP", 'color', true).render();
}

/**
 * Renders a filled transparent box inside the selection.
 * @param worldBox - Contains the world space edge coordinates of the selection box.
 */
function renderSelectionBoxFill(worldBox: DoubleBoundingBox): void {
	// Also construct the semi-transparent fill data and render it
	const fillData: number[] = primitives.Quad_Color(worldBox.left, worldBox.bottom, worldBox.right, worldBox.top, FILL_COLOR);
	createRenderable(fillData, 2, "TRIANGLES", 'color', true).render();
}

/**
 * Renders the small square in the corner of the selection box.
 * @param worldBox - Contains the world space edge coordinates of the selection box.
 */
function renderCornerSquare(worldBox: DoubleBoundingBox): void {
	const widthVirtualPixels = 10;
	// Convert to world space
	const widthWorld = space.convertPixelsToWorldSpace_Virtual(widthVirtualPixels);

	// Bottom right corner world space
	const corner: DoubleCoords = [worldBox.right, worldBox.bottom];

	// Calculate vertex data
	const left = corner[0] - widthWorld / 2;
	const right = corner[0] + widthWorld / 2;
	const bottom = corner[1] - widthWorld / 2;
	const top = corner[1] + widthWorld / 2;

	const fillData: number[] = primitives.Quad_Color(left, bottom, right, top, OUTLINE_COLOR);
	// Render the square
	createRenderable(fillData, 2, "TRIANGLES", 'color', true).render();
}


// Exports ----------------------------------------------------------


export default {
	outlineRankAndFile,
	renderSelectionBoxWireframe,
	renderSelectionBoxFill,
	renderCornerSquare,
};