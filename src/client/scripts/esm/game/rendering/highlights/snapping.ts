
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
import math, { Color, Vec2 } from "../../../util/math.js";
import gameslot from "../../chess/gameslot.js";
import boardutil from "../../../chess/util/boardutil.js";
import gamefileutility from "../../../chess/util/gamefileutility.js";
import { createModel } from "../buffermodel.js";
import spritesheet from "../spritesheet.js";
import drawrays from "./annotations/drawrays.js";
import { Mouse } from "../../input.js";
// @ts-ignore
import transition from "../transition.js";
// @ts-ignore
import perspective from "../perspective.js";
// @ts-ignore
import bufferdata from "../bufferdata.js";


import type { Coords } from "../../../chess/util/coordutil.js";
import type { Line } from "./highlightline.js";
import coordutil from "../../../chess/util/coordutil.js";
import mouse from "../../../util/mouse.js";
import { listener_overlay } from "../../chess/game.js";
import boardpos from "../boardpos.js";


// Variables --------------------------------------------------------------


/** Width of entities (mini images, highlights) when zoomed out, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS: number = 40; // Default: 36

/** The percentage of {@link ENTITY_WIDTH_VPIXELS} of which the mouse should snap to entities. */
const SNAPPING_DIST: number = 1.0; // Default: 1.0


/** Properties of the glow dot when rendering the snapped coord. */
const GLOW_DOT = {
	RADIUS_PIXELS: 8,
	RESOLUTION: 16
};


const GHOST_IMAGE_OPACITY = 1;


/** The current point the mouse is snapped to this frame, if it is. */
let snap: {
	coords: Coords,
	/** The color of the line we are snapped to. Already made opaque. */
	color: Color,
	/** The type of piece to render at the snap point, if applicable */
	type?: number,
	/** The source that eminated the line we are snapping to, if we are snapping. */
	source?: Coords,
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

/**
 * SHOULD BE DONE BEFORE {@link updateSnapping}
 * This will teleport to all hovered entities.
 */
function updateEntitiesHovered() {
	drawsquares.updateHighlightsHovered(annotations.getSquares());
	miniimage.updateImagesHovered(); // This updates hovered images at the same time

	// Test if clicked (teleport to all hovered entities)
	const allEntitiesHovered = [...miniimage.imagesHovered, ...drawsquares.highlightsHovered];
	if (allEntitiesHovered.length > 0) {
		if (mouse.isMouseClicked(Mouse.LEFT)) {
			transition.initTransitionToCoordsList(allEntitiesHovered);
			mouse.claimMouseClick(Mouse.LEFT);
		} else if (mouse.isMouseDown(Mouse.LEFT)) {
			listener_overlay.claimMouseDown(Mouse.LEFT);
			mouse.claimMouseDown(Mouse.LEFT); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
		}
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

	if (!boardpos.areZoomedOut()) return; // Quit if we're not even zoomed out.
	if (isHoveringAtleastOneEntity()) return; // Early exit, no snapping in this case.

	const rayLines = drawrays.lines;
	const selectedPieceLegalMovesLines = selectedpiecehighlightline.lines;

	const allLines: Line[] = [...rayLines, ...selectedPieceLegalMovesLines];
	if (allLines.length === 0) return; // No lines to have snap

	const mouseCoords = mouse.getTileMouseOver_Float()!;

	// First see if the mouse is even CLOSE to any of these lines,
	// as otherwise we can't snap to anything anyway.
	const linesSnapPoints: { line: Line, snapPoint: { coords: Coords, distance: number }}[] = allLines.map(line => {
		const snapPoint = math.closestPointOnLine(line.start, line.end, mouseCoords);
		return { line, snapPoint };
	});

	let closestSnap: { line: Line, snapPoint: { coords: Coords, distance: number }} = linesSnapPoints[0]!;
	for (const lineSnapPoint of linesSnapPoints) {
		if (lineSnapPoint.snapPoint.distance < closestSnap.snapPoint.distance) closestSnap = lineSnapPoint;
	}

	const snapDistCoords = SNAPPING_DIST / (2 * boardpos.getBoardScale());
	if (closestSnap.snapPoint.distance > snapDistCoords) {
		console.log("Mouse no close snap");
		return; // No line close enough for the mouse to snap to anything
	}

	// Filter out lines which the mouse is too far away from
	const closeLines = linesSnapPoints.filter(lsp => lsp.snapPoint.distance <= snapDistCoords);

	/**
	 * Next, calculate all intersections of all highlight lines (rays and legal moves),
	 * and see if the mouse is close enough to snap to them.
	 * 
	 * If so, those take priority.
	 */

	const intersections: Coords[] = [];
	for (let a = 0; a < closeLines.length - 1; a++) {
		const line1 = closeLines[a]!;
		for (let b = a + 1; b < closeLines.length; b++) {
			const line2 = closeLines[b]!;
			// Calculate where they intersect
			const intsect = math.intersectLineSegments(line1.line.start, line1.line.end, line2.line.start, line2.line.end);
			if (intsect === undefined) continue; // Don't intersect
			// Push it to the intersections, preventing duplicates
			if (intersections.every(i => !coordutil.areCoordsEqual_noValidate(i, intsect))) intersections.push(intsect);
		}
	}

	// Calculate the mouse distance to each

	let closestIntsect: { coords: Coords, dist: number } | undefined;
	for (const i of intersections) {
		// Calculate distance to mouse
		const dist = math.euclideanDistance(i, mouseCoords);
		if (closestIntsect === undefined || dist < closestIntsect.dist) closestIntsect = { coords: i, dist };
	}

	if (closestIntsect && closestIntsect.dist <= snapDistCoords) {
		// SNAP to this line intersection, and exit! It takes priority

		const color = [
			
		]
		
		// snap = { coords: closestIntsect.coords, color: closestSnap.line.color, type: closestSnap.line.piece };
		// // Teleport if clicked
		// if (input.getPointerClicked()) transition.initTransitionToCoordsList([snap.coords]);
	}



	/**
	 * At this point, there is no intersections  of lines to snap to.
	 * 
	 * Next, eminate lines in all directions from each entity, seeing where they cross
	 * existing lines, calculating what we should snap to.
	 */

	const gamefile = gameslot.getGamefile()!;
	const allPrimitiveSlidesInGame = gamefile.pieces.slides.filter((vector: Vec2) => math.GCD(vector[0], vector[1]) === 1); // Filters out colinears, and thus potential repeats.


	// 1. Square Annotes & Intersections of Rays (same priority)

	// All Ray intersections are temporarily added as additional Squares

	const rayIntersections = drawrays.collapseRays(annotations.getRays());
	const squares = annotations.getSquares();
	const originalSquareLength = squares.length;
	squares.push(...rayIntersections);
	
	// Now see if we should snap to any Square

	const closestSquareSnap = findClosestEntityOfGroup(squares, closeLines, mouseCoords, allPrimitiveSlidesInGame);
	if (closestSquareSnap) {
		// Is the snap within snapping distance of the mouse?
		if (closestSquareSnap.dist < snapDistCoords) {
			snap = closestSquareSnap;
			// Teleport if clicked
			if (mouse.isMouseClicked(Mouse.LEFT)) transition.initTransitionToCoordsList([snap.coords]);
			squares.length = originalSquareLength; // Remove the temporary squares we added for ray intersections
			return;
		}
	}
	squares.length = originalSquareLength; // Remove the temporary squares we added for ray intersections

	// 2. Pieces

	const pieces = boardutil.getCoordsOfAllPieces(gamefile.pieces);
	const closestPieceSnap = findClosestEntityOfGroup(pieces, closeLines, mouseCoords, allPrimitiveSlidesInGame);
	if (closestPieceSnap) {
		// Is the snap within snapping distance of the mouse?
		if (closestPieceSnap.dist < snapDistCoords) {
			console.log(2);
			snap = closestPieceSnap;
			// Teleport if clicked
			if (mouse.isMouseClicked(Mouse.LEFT)) transition.initTransitionToCoordsList([snap.coords]);
			return;
		}
	}
	
	// 3. Origin (Center of Play)

	const startingBox = gamefileutility.getStartingAreaBox(gamefile);
	const origin = math.calcCenterOfBoundingBox(startingBox);
	const closestOriginSnap = findClosestEntityOfGroup([origin], closeLines, mouseCoords, allPrimitiveSlidesInGame);
	if (closestOriginSnap) {
		// Is the snap within snapping distance of the mouse?
		if (closestOriginSnap.dist < snapDistCoords) {
			snap = closestOriginSnap;
			// Teleport if clicked
			if (mouse.isMouseClicked(Mouse.LEFT)) transition.initTransitionToCoordsList([snap.coords]);
			return;
		}
	}

	// No snap found!

	// Instead, set the snap to the closest point on the line.
	snap = { coords: closestSnap.snapPoint.coords, color: closestSnap.line.color, type: closestSnap.line.piece };
	// Teleport if clicked
	if (mouse.isMouseClicked(Mouse.LEFT)) {
		transition.initTransitionToCoordsList([snap.coords]);
		mouse.claimMouseClick(Mouse.LEFT);
	}
}

function findClosestEntityOfGroup(entities: Coords[], closeLines: { line: Line, snapPoint: { coords: Coords, distance: number }}[], mouseCoords: Coords, allPrimitiveSlidesInGame: Vec2[]): { coords: Coords, color: Color, dist: number, source: Coords, type?: number } | undefined {
	
	let closestEntitySnap: { coords: Coords, color: Color, dist: number, source: Coords, type?: number } | undefined;

	for (const s of entities) {
		const eminatingLines = getLinesEminatingFromPoint(s, allPrimitiveSlidesInGame);

		// Calculate their intersections with each individual line close to the mouse
		for (const eminatedLine of eminatingLines) {
			for (const highlightLine of closeLines) {
				// Do they intersect?
				const intersection = math.calcIntersectionPointOfLines(...eminatedLine, ...highlightLine.line.coefficients);
				if (intersection === undefined) continue;
				// They DO intersect.
				const dist = math.euclideanDistance(intersection, mouseCoords);
				// if (s[0] === 2000) console.log(dist);
				// Is the intersection point closer to the mouse than the previous closest snap?
				// const intersectionWorld = space.convertCoordToWorldSpace(intersection);
				if (closestEntitySnap === undefined || dist < closestEntitySnap.dist) {
					// if (s[0] === 2000) console.log("Found closer snap:", intersection, dist, highlightLine.line.piece, [...s]);
					closestEntitySnap = { coords: intersection, color: highlightLine.line.color, dist, type: highlightLine.line.piece, source: [...s] };
				}
			}
		}
	}

	return closestEntitySnap;
}

function getLinesEminatingFromPoint(coords: Coords, allLinesInGame: Vec2[]): [number, number, number][] {
	return allLinesInGame.map(l => math.getLineGeneralFormFromCoordsAndVec(coords, l));
}


// Rendering --------------------------------------------------------------


/**
 * Snapping is in charge of rendering either a glow dot on the snap point,
 * or a mini image of a piece on the legal move line.
 */
function render() {
	if (snap === undefined) return; // No snap to render

	// Render a single gray line between the snap point and its source
	if (snap.source !== undefined) {
		const [r,g,b,a] = [0, 0, 1, 0.3];
		const start = space.convertCoordToWorldSpace(snap.source);
		const end = space.convertCoordToWorldSpace(snap.coords);
		const data = [
			//   Vertex              Color
			start[0], start[1],   r, g, b, a,
			end[0], end[1],       r, g, b, a
		];
		createModel(data, 2, 'LINES', true).render();
	}

	const coordsWorld = space.convertCoordToWorldSpace_IgnoreSquareCenter(snap.coords);

	if (snap.type === undefined) {
		// Render glow dot
		const color = snap.color;
		const colorTransparent = [...color];
		colorTransparent[3] = 0;

		const radius = space.convertPixelsToWorldSpace_Virtual(GLOW_DOT.RADIUS_PIXELS);
		const data: number[] = bufferdata.getDataGlowDot(...coordsWorld, radius, GLOW_DOT.RESOLUTION, color, colorTransparent);
		createModel(data, 2, 'TRIANGLE_FAN', true).render();
	} else {
		// Render mini image of piece
		const model = generateGhostImageModel(snap.type, coordsWorld);
		model.render();
	}
}

/**
 * TODO: Dont use the spritesheet
 */
function generateGhostImageModel(type: number, coords: Coords) {

	const dataGhost: number[] = [];

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const entityWorldWidth = getEntityWidthWorld();
	const halfWidth = entityWorldWidth / 2;

	const startX = coords[0] - halfWidth;
	const startY = coords[1] - halfWidth;
	const endX = startX + entityWorldWidth;
	const endY = startY + entityWorldWidth;

	const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, 1, 1, 1, GHOST_IMAGE_OPACITY);

	dataGhost.push(...data);
	
	return createModel(dataGhost, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
}


// Exports --------------------------------------------------------------


export default {
	ENTITY_WIDTH_VPIXELS,
	getEntityWidthWorld,

	isHoveringAtleastOneEntity,
	getClosestEntityToMouse,
	updateEntitiesHovered,

	updateSnapping,
	render,
};