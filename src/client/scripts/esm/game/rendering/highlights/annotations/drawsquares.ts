
/**
 * This script allows the user to highlight squares on the board.
 * 
 * Helpful for analysis, and requested by many.
 */

import coordutil from "../../../../chess/util/coordutil.js";
import math, { Color } from "../../../../util/math.js";
import space from "../../../misc/space.js";
import { BufferModelInstanced, createModel_Instanced } from "../../buffermodel.js";
import instancedshapes from "../../instancedshapes.js";
import preferences from "../../../../components/header/preferences.js";
import snapping from "../snapping.js";
// @ts-ignore
import movement from "../../movement.js";
// @ts-ignore
import input from "../../../input.js";
// @ts-ignore
import guipause from "../../../gui/guipause.js";
// @ts-ignore
import perspective from "../../perspective.js";


import type { Coords } from "../../../../chess/util/coordutil.js";


// Variables -----------------------------------------------------------------

/** ADDITONAL (not overriding) opacity when hovering over highlights. */
const hover_opacity = 0.5;


/** All highlights currently on the board. */
const highlights: Coords[] = [];
/** All highlights currently being hovered over, if zoomed out. */
const highlightsHovered: Coords[] = [];
/**
 * All highlights currently being hovered over EUCLIDEAN DISTANCES to the mouse in world space.
 * For quickly comparing against other hovered annotes.
 * EACH INDEX MAPS TO THE SAME INDEX IN {@link highlightsHovered}.
 */
const highlightsHovered_dists: number[] = [];


// Updating -----------------------------------------------------------------


/**
 * Tests if the user has added any new square highlights,
 * or deleted any existing ones.
 */
function update() {
	// If the pointer simulated a right click, add a highlight!
	if (input.getPointerClicked_Right()) {
		const pointerWorld: Coords = input.getPointerWorldLocation() as Coords;
		const pointerSquare: Coords = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

		// Check if the square is already highlighted
		const index = highlights.findIndex(coords => coordutil.areCoordsEqual_noValidate(coords, pointerSquare));

		if (index !== -1) highlights.splice(index, 1); // Remove
		else highlights.push(pointerSquare); // Add
	}
}

function updateHighlightsHovered() {
	highlightsHovered.length = 0;
	highlightsHovered_dists.length = 0;
	
	if (!movement.isScaleLess1Pixel_Virtual() || guipause.areWePaused() || highlights.length === 0) return;
	if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

	// Test if any one highlight is being hovered over

	const mouseWorld: Coords = input.getPointerWorldLocation() as Coords;

	const entityHalfWidthWorld = snapping.getEntityWidthWorld() / 2;

	// Iterate through each highlight to see if the mouse world is within ENTITY_WIDTH_VPIXELS of it
	highlights.forEach(coords => {
		// const coordsWorld = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
		const coordsWorld = space.convertCoordToWorldSpace(coords);
		const dist_cheby = math.chebyshevDistance(coordsWorld, mouseWorld);
		if (dist_cheby < entityHalfWidthWorld) {
			highlightsHovered.push(coords);
			// Upgrade the distance to euclidean
			highlightsHovered_dists.push(math.euclideanDistance(coordsWorld, mouseWorld));
		}
	});
}

function clearSquares() {
	highlights.length = 0;
}


// Rendering -----------------------------------------------------------------


function genModel(highlights: Coords[], color: Color): BufferModelInstanced {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	highlights.forEach(coords => {
		// const worldLoc = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
		const worldLoc = space.convertCoordToWorldSpace(coords);
		instanceData.push(...worldLoc);
	});

	return createModel_Instanced(vertexData, instanceData, 'TRIANGLES', true);
}


function render() {
	if (highlights.length === 0) return;

	// If we're zoomed out, then the size of the highlights is constant.
	const size = movement.isScaleLess1Pixel_Virtual() ? snapping.getEntityWidthWorld() : movement.getBoardScale();

	// Render main highlights
	const color = preferences.getAnnoteSquareColor();

	genModel(highlights, color).render(undefined, undefined, { size });
	// webgl.executeWithDepthFunc_ALWAYS(genModel(highlights, color).render(undefined, undefined, { size }));

	// Render hovered highlights
	if (highlightsHovered.length > 0) {
		const color = preferences.getAnnoteSquareColor();
		const hoverColor = [
			color[0],
			color[1],
			color[2],
			hover_opacity
		] as Color;
		genModel(highlightsHovered, hoverColor).render(undefined, undefined, { size });
		// webgl.executeWithDepthFunc_ALWAYS(genModel(highlightsHovered, hoverColor).render(undefined, undefined, { size }));
	}
}


// Exports -------------------------------------------------------------------


export default {
	highlights,
	highlightsHovered,
	highlightsHovered_dists,

	update,
	updateHighlightsHovered,
	clearSquares,
	render,
};