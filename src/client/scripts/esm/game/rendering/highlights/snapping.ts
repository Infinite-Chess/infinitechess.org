
/**
 * This script initiates teleports to all mini images and square annotes clicked.
 * 
 * It also manages all renderd entities when zoomed out.
 */

import miniimage from "../miniimage.js";
import drawsquares from "./annotations/drawsquares.js";
import space from "../../misc/space.js";
import annotations from "./annotations/annotations.js";
// @ts-ignore
import input from "../../input.js";
// @ts-ignore
import transition from "../transition.js";
import { Coords } from "../../../chess/util/coordutil.js";


// Variables --------------------------------------------------------------


/** Width of entities (mini images, highlights) when zoomed out, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS: number = 40; // Default: 36


// Methods --------------------------------------------------------------


/** {@link ENTITY_WIDTH_VPIXELS}, but converted to world-space units. This can change depending on the screen dimensions. */
function getEntityWidthWorld() {
	return space.convertPixelsToWorldSpace_Virtual(ENTITY_WIDTH_VPIXELS);
}

function isHoveringAtleastOneEntity() {
	return miniimage.imagesHovered.length > 0 || drawsquares.highlightsHovered.length > 0;
}

function getClosestEntityToMouse(): { coords: Coords, dist: number, type: 'miniimage' | 'square', index: number } {
	if (!isHoveringAtleastOneEntity()) throw Error("Should not call getClosestEntityToMouse() if isHoveringAtleastOneEntity() is false.");
	
	// Find the closest hovered entity to the pointer

	let closestEntity: { coords: Coords, dist: number, type: 'miniimage' | 'square', index: number } | undefined = undefined;

	// Pieces
	for (let i = 0; i < miniimage.imagesHovered.length; i++) {
		const coords = miniimage.imagesHovered[i]!;
		const dist = miniimage.imagesHovered_dists[i]!;
		if (closestEntity === undefined || dist <= closestEntity.dist) closestEntity = { coords, dist, type: 'miniimage', index: i };
	}

	// Square Highlights
	const highlightsHovered = drawsquares.highlightsHovered;
	const highlightsHovered_dists = drawsquares.highlightsHovered_dists;
	for (let i = 0; i < highlightsHovered.length; i++) {
		const coords = highlightsHovered[i]!;
		const dist = highlightsHovered_dists[i]!;
		if (closestEntity === undefined || dist <= closestEntity.dist) closestEntity = { coords, dist, type: 'square', index: i };
	}

	if (closestEntity === undefined) throw Error("No closest entity found, this should never happen.");
	return closestEntity;
}

function updateEntitiesHovered() {
	drawsquares.updateHighlightsHovered(annotations.getSquares());
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
	getClosestEntityToMouse,
	updateEntitiesHovered,
};