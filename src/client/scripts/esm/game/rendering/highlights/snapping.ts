
/**
 * This script initiates teleports to all mini images and square annotes clicked.
 * 
 * It also manages all renderd entities when zoomed out.
 */

import miniimage from "../miniimage.js";
import drawsquares from "./annotations/drawsquares.js";
import space from "../../misc/space.js";
// @ts-ignore
import input from "../../input.js";
// @ts-ignore
import transition from "../transition.js";


// Variables --------------------------------------------------------------


/** Width of entities (mini images, highlights) when zoomed out, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS: number = 36; // Default: 36


// Methods --------------------------------------------------------------


/** {@link ENTITY_WIDTH_VPIXELS}, but converted to world-space units. This can change depending on the screen dimensions. */
function getEntityWidthWorld() {
	return space.convertPixelsToWorldSpace_Virtual(ENTITY_WIDTH_VPIXELS);
}

function isHoveringAtleastOneEntity() {
	return miniimage.imagesHovered.length > 0 || drawsquares.highlightsHovered.length > 0;
}

function updateEntitiesHovered() {
	drawsquares.updateHighlightsHovered();
	miniimage.updateImagesHovered(); // This updates hovered images at the same time

	// Test if clicked (teleport to all hovered entities)
	const allEntitiesHovered = [...miniimage.imagesHovered, ...drawsquares.highlightsHovered];
	if (allEntitiesHovered.length > 0) {
		if (input.getPointerClicked()) transition.initTransitionToCoordsList(allEntitiesHovered);
		else if (input.getPointerDown()) input.removePointerDown(); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
	}
}


// Exports --------------------------------------------------------------


export default {
	ENTITY_WIDTH_VPIXELS,
	getEntityWidthWorld,

	isHoveringAtleastOneEntity,
	updateEntitiesHovered,
};