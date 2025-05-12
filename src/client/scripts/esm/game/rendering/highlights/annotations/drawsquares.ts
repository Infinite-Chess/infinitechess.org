
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
import { Mouse } from "../../../input.js";
// @ts-ignore
import guipause from "../../../gui/guipause.js";
// @ts-ignore
import perspective from "../../perspective.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Square } from "./annotations.js";
import boardpos from "../../boardpos.js";
import mouse from "../../../../util/mouse.js";


// Variables -----------------------------------------------------------------


/**
 * To make single Square highlight more visible than rays (which
 * include a LOT of squares), lone squares get an opacity offset.
 */
const OPACITY_OFFSET = 0.1;

/** ADDITONAL (not overriding) opacity when hovering over highlights. */
const hover_opacity = 0.5;

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
 * This is done PRIOR to update(), since that depends on what annotes we're currently hovering over.
 * @param highlights - All square highlights currently on the board.
 */
function updateHighlightsHovered(highlights: Square[]) {
	highlightsHovered.length = 0;
	highlightsHovered_dists.length = 0;
	
	if (!boardpos.areZoomedOut() || guipause.areWePaused() || highlights.length === 0) return;
	if (perspective.getEnabled() && !perspective.isMouseLocked()) return;

	// Test if any one highlight is being hovered over

	const mouseWorld: Coords = mouse.getMouseWorld(Mouse.RIGHT)!;

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

/**
 * Tests if the user has added any new square highlights,
 * or deleted any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param highlights - All square highlights currently on the board.
 */
function update(highlights: Square[]) {
	// If the pointer simulated a right click, add a highlight!
	if (mouse.isMouseClicked(Mouse.RIGHT)) {
		const pointerWorld: Coords = mouse.getMouseWorld(Mouse.RIGHT)!;
		const pointerSquare: Coords = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

		const isHoveringAtleastOneEntity = snapping.isHoveringAtleastOneEntity();

		if (!boardpos.areZoomedOut() || !isHoveringAtleastOneEntity) { // Zoomed in OR not hovering anything. Normal behavior: toggle highlight on square.
			// Check if the square is already highlighted
			const index = highlights.findIndex(coords => coordutil.areCoordsEqual_noValidate(coords, pointerSquare));
	
			if (index !== -1) highlights.splice(index, 1); // Remove
			else highlights.push(pointerSquare); // Add
		} else { // Zoomed out AND hovering atleast one entity. Behavior: toggle highlight on closest entity to mouse.
			// Find the closest hovered entity to the pointer
			const closestEntity = snapping.getClosestEntityToMouse();

			// Now that we have the closest hovered entity, toggle the highlight on its coords.
			const index = highlights.findIndex(coords => coordutil.areCoordsEqual_noValidate(coords, closestEntity.coords));
			if (index !== -1) { // Already highlighted, Remove
				highlights.splice(index, 1);
				// Also remove from highlightsHovered. Prevents a bug where the highlight doesn't dissapear until the next frame render.
				if (closestEntity.type === 'square') {
					highlightsHovered.splice(closestEntity.index, 1);
					highlightsHovered_dists.splice(closestEntity.index, 1);
				} else throw Error("Cannot remove a highlight from highlightsHovered if it was not a square highlight.");
			}
			else highlights.push(closestEntity.coords); // Add
		}
		// Claim the click so other scripts don't also use it
		// input.getPointerClicked(); !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	}
}


// Rendering -----------------------------------------------------------------


function genModel(highlights: Square[], color: Color): BufferModelInstanced {
	const vertexData: number[] = instancedshapes.getDataLegalMoveSquare(color);
	const instanceData: number[] = [];

	highlights.forEach(coords => {
		// const worldLoc = space.convertCoordToWorldSpace_IgnoreSquareCenter(coords);
		const worldLoc = space.convertCoordToWorldSpace(coords);
		instanceData.push(...worldLoc);
	});

	return createModel_Instanced(vertexData, instanceData, 'TRIANGLES', true);
}


function render(highlights: Square[]) {
	// Early exit if no squares to draw
	if (highlights.length === 0) return;

	// If we're zoomed out, then the size of the highlights is constant.
	const size = boardpos.areZoomedOut() ? snapping.getEntityWidthWorld() : boardpos.getBoardScale();

	// Render main highlights
	const color = preferences.getAnnoteSquareColor();
	color[3] += OPACITY_OFFSET; // Add opacity offset to make it more visible than rays

	genModel(highlights, color).render(undefined, undefined, { size });

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
	}
}


// Exports -------------------------------------------------------------------


export default {
	highlightsHovered,
	highlightsHovered_dists,

	update,
	updateHighlightsHovered,
	render,
};