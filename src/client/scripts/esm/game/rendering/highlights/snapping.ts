
/**
 * This script initiates teleports to all mini images and square annotes clicked.
 * 
 * It also manages all renderd entities when zoomed out.
 */

import miniimage from "../miniimage.js";
import drawsquares from "./annotations/drawsquares.js";
import space from "../../misc/space.js";
import annotations from "./annotations/annotations.js";
import selectedpiecehighlightline from "./selectedpiecehighlightline.js";
import math, { Vec2 } from "../../../util/math.js";
// @ts-ignore
import input from "../../input.js";
// @ts-ignore
import transition from "../transition.js";


import type { Coords } from "../../../chess/util/coordutil.js";
import type { Line } from "./highlightline.js";
import gameslot from "../../chess/gameslot.js";
import board from "../board.js";


// Variables --------------------------------------------------------------


/** Width of entities (mini images, highlights) when zoomed out, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS: number = 40; // Default: 36

/** The percentage of {@link ENTITY_WIDTH_VPIXELS} of which the mouse should snap to entities. */
const SNAPPING_DIST: number = 1.0; // Default: 1.0


/** The current point the mouse is snapped to this frame, if it is. */
let snap: {
	coords: Coords,
	/** The source that eminated the line we are snapping to. */
	source: Coords
} | undefined;


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

/** SHOULD BE DONE BEFORE {@link updateSnapping} */
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


// Snapping -------------------------------------------------------------

/**
 * Reads all calculate highlights lines (selected piece legal moves, drawn Rays),
 * eminates lines in all directions from all entities and calculates where those
 * intersect any of the highlight lines, calculating where we should snap the mouse to,
 * and teleporting if clicked.
 * 
 * EXPECTS {@link updateEntitiesHovered} TO BE CALLED BEFORE THIS, as we
 * should not snap to anything if the mouse is hovering atleast on entity.
 */
function updateSnapping() {
	snap = undefined;

	if (isHoveringAtleastOneEntity()) return; // Early exit, no snapping in this case.
	const selectedPieceLegalMovesLines = selectedpiecehighlightline.lines;
	if (selectedPieceLegalMovesLines.length === 0) return; // No lines to have snap

	// const mouseWorld: Coords = input.getMouseWorldLocation() as Coords;
	const mouseCoords = board.gtile_MouseOver_Float();

	// First see if the mouse is even CLOSE to any of these lines,
	// as otherwise we can't snap to anything anyway.

	// First see if the mouse is even CLOSE to any of these lines,
	// as otherwise we can't snap to anything anyway.
	const linesSnapPoints: { line: Line, snapPoint: { coords: Coords, distance: number }}[] = selectedPieceLegalMovesLines.map(line => {
		const snapPoint = math.closestPointOnLine(line.start, line.end, mouseCoords);
		return { line, snapPoint };
	});

	let closestSnap: { line: Line, snapPoint: { coords: Coords, distance: number }} = linesSnapPoints[0]!;
	for (const lineSnapPoint of linesSnapPoints) {
		if (lineSnapPoint.snapPoint.distance < closestSnap.snapPoint.distance) closestSnap = lineSnapPoint;
	}

	const snapDistWorld = SNAPPING_DIST * getEntityWidthWorld() / 2;
	if (closestSnap.snapPoint.distance > snapDistWorld) return; // No line close enough for the mouse to snap to anything

	// Filter out lines which the mouse is too far away from
	const closeLines = linesSnapPoints.filter(lsp => lsp.snapPoint.distance <= snapDistWorld);

	/**
	 * Next, eminate lines in all directions from each entity, seeing where they cross
	 * existing lines, calculating what we should snap to.
	 */

	const allPrimitiveSlidesInGame = gameslot.getGamefile()!.pieces.slides.filter(vector => math.GCD(vector[0], vector[1]) === 1); // Filters out colinears, and thus potential repeats.

	// 1. Intersections of Rays (TODO)


	// 2. Square Annotes


	const squares = annotations.getSquares();

	let closestSquareSnap: { coords: Coords, dist: number, source: Coords } | undefined;

	for (const s of squares) {
		const eminatingLines = getLinesEminatingFromPoint(s, allPrimitiveSlidesInGame);

		// Calculate their intersections with each individual line close to the mouse
		for (const eminatedLine of eminatingLines) {
			for (const highlightLine of closeLines) {
				// Do they intersect?
				const intersection = math.calcIntersectionPointOfLines(...eminatedLine, ...highlightLine.line.coefficients);
				if (intersection === undefined) continue;
				// They DO intersect.
				// Is the intersection point closer to the mouse than the previous closest snap?
				// const intersectionWorld = space.convertCoordToWorldSpace(intersection);
				const dist = math.euclideanDistance(intersection, mouseCoords);
				if (closestSquareSnap === undefined || dist < closestSquareSnap.dist) closestSquareSnap = { coords: intersection, dist, source: [...s] };
			}
		}
	}

	if (closestSquareSnap) {
		snap = { coords: closestSquareSnap.coords, source: closestSquareSnap.source };
		// Teleport if clicked
		if (input.getPointerClicked()) transition.initTransitionToCoordsList([snap]);
		return; // Nothing below takes snapping priority over Squares
	}


	// 3. Pieces


	


	// 4. Origin (Center of Play)
}

function getLinesEminatingFromPoint(coords: Coords, allLinesInGame: Vec2[]): [number, number, number][] {
	return allLinesInGame.map(l => math.getLineGeneralFormFromCoordsAndVec(coords, l));
}


// Exports --------------------------------------------------------------


export default {
	ENTITY_WIDTH_VPIXELS,
	getEntityWidthWorld,

	isHoveringAtleastOneEntity,
	getClosestEntityToMouse,
	updateEntitiesHovered,

	updateSnapping,
};