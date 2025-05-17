
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
import coordutil from "../../../chess/util/coordutil.js";
import mouse from "../../../util/mouse.js";
import { listener_overlay } from "../../chess/game.js";
import boardpos from "../boardpos.js";
import preferences from "../../../components/header/preferences.js";
// @ts-ignore
import transition from "../transition.js";
// @ts-ignore
import perspective from "../perspective.js";
// @ts-ignore
import bufferdata from "../bufferdata.js";
// @ts-ignore
import guipause from "../../gui/guipause.js";


import type { Coords } from "../../../chess/util/coordutil.js";
import type { Line } from "./highlightline.js";


// Variables --------------------------------------------------------------


/** Width of entities (mini images, highlights) when zoomed out, in virtual pixels. */
const ENTITY_WIDTH_VPIXELS: number = 40; // Default: 36


/** All default snapping vectors. */
const VECTORS: Coords[] = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
/** The knightrider hippogonals. */
const VECTORS_HIPPOGONAL: Coords[] = [[1,2],[-1,2],[1,-2],[-1,-2],[2,1],[-2,1],[2,-1],[-2,-1]];

/** The color of the line that shows you what entity your mouse is snapped to. */
const SNAP_LINE_COLOR: Color = [0, 0, 1, 0.3];


/** Properties of the glow dot when rendering the snapped coord. */
const GLOW_DOT = {
	RADIUS_PIXELS: 8,
	RESOLUTION: 16
};

/**
 * The opacity of the ghost image that's rendered when hovering over
 * the highlight line of the selected piece's legal moves.
 */
const GHOST_IMAGE_OPACITY = 1;

/**
 * If more pieces than this are present in the game, snapping skips
 * checking if we should snap to a piece, as it's too slow.
 */
const THRESHOLD_TO_SNAP_PIECES = 10_000;


type Snap = {
	coords: Coords,
	/** The color of the line we are snapped to. Already made opaque. */
	color: Color,
	/** The type of piece to render at the snap point, if applicable */
	type?: number,
	/** The source that eminated the line we are snapping to, if we are snapping. */
	source?: Coords,
}


// Entity Hovering ---------------------------------------------------------


/** {@link ENTITY_WIDTH_VPIXELS}, but converted to world-space units. This can change depending on the screen dimensions. */
function getEntityWidthWorld() {
	return space.convertPixelsToWorldSpace_Virtual(ENTITY_WIDTH_VPIXELS);
}

/**
 * Tests if a specific pointer is hovering over entities this frame.
 * If so, it shouldn't snap to anything.
 */
function isWorldHoveringAtleastOneEntity(world: Coords): boolean {
	if (!isSnappingEnabledThisFrame()) return false;

	return getAllEntitiesWorldHovers(world).length > 0;
}

function getAllEntitiesWorldHovers(world: Coords) {
	const imagesHovered = miniimage.getImagesBelowWorld(world, false).images;
	const highlightsHovered = drawsquares.getSquaresBelowWorld(annotations.getSquares(), world, false).squares;
	return [...imagesHovered, ...highlightsHovered];
}

type ClosestEntity = {
	coords: Coords,
	/** The euclidean distance in coordinates from the mouse to the entity. */
	dist: number,
	type: 'miniimage' | 'square',
	/** The index of the entity within its home list. */
	index: number
};

/** Calculates the closest entity (piece/square) to the given world coords. */
function getClosestEntityToWorld(world: Coords): ClosestEntity | undefined {
	if (!isSnappingEnabledThisFrame()) return undefined;

	// Find the closest hovered entity to the pointer
	let closestEntity: ClosestEntity | undefined = undefined;

	const imagesHovered = miniimage.getImagesBelowWorld(world, true);
	const highlightsHovered = drawsquares.getSquaresBelowWorld(annotations.getSquares(), world, true);

	// Pieces
	for (let i = 0; i < imagesHovered.images.length; i++) {
		const coords = imagesHovered.images[i]!;
		const dist = imagesHovered.dists![i]!;
		if (closestEntity === undefined || dist <= closestEntity.dist) closestEntity = { coords, dist, type: 'miniimage', index: i };
	}

	// Square Highlights
	for (let i = 0; i < highlightsHovered.squares.length; i++) {
		const coords = highlightsHovered.squares[i]!;
		const dist = highlightsHovered.dists![i]!;
		if (closestEntity === undefined || dist <= closestEntity.dist) closestEntity = { coords, dist, type: 'square', index: i };
	}

	return closestEntity;
}


/**
 * Calculates what entities are below the click location.
 * Teleports to them, claiming the click.
 */
function teleportToEntitiesIfClicked() {
	if (!isSnappingEnabledThisFrame()) return;

	if (!mouse.isMouseClicked(Mouse.LEFT) && !mouse.isMouseDown(Mouse.LEFT)) return; // Only teleport if clicked

	const mouseWorld = mouse.getMouseWorld(Mouse.LEFT)!;

	const allEntitiesHovered = getAllEntitiesWorldHovers(mouseWorld);
	
	// console.log("Hovered entities:", jsutil.deepCopyObject(allEntitiesHovered));

	if (allEntitiesHovered.length === 0) return; // No images to teleport to

	if (mouse.isMouseClicked(Mouse.LEFT)) {
		mouse.claimMouseClick(Mouse.LEFT);
		transition.initTransitionToCoordsList(allEntitiesHovered);
	} else if (mouse.isMouseDown(Mouse.LEFT) && listener_overlay.getPointerCount() !== 2) { // Allows second finger to grab the board
		mouse.claimMouseDown(Mouse.LEFT); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
	}
}


// Snapping --------------------------------------------------------------------


/** We do not snap when zoomed in. */
function isSnappingEnabledThisFrame(): boolean {
	if (!boardpos.areZoomedOut()) return false;
	if (guipause.areWePaused()) return false;
	if (perspective.getEnabled() && !perspective.isMouseLocked()) return false;

	return true;
}

/** Snap's the provided world coords to the nearest snappable coords. */
function getWorldSnapCoords(world: Coords): Coords | undefined {
	if (!isSnappingEnabledThisFrame()) return undefined;

	const snap = snapPointerWorld(world);
	if (snap === undefined) return undefined;
	else return space.roundCoords(snap.coords);
}

type LineSnapPoint = {
	line: Line,
	snapPoint: { coords: Coords, distance: number }
};

/**
 * Reads all calculate highlights lines (selected piece legal moves, drawn Rays),
 * eminates lines in all directions from all entities and calculates where those
 * intersect any of the highlight lines, calculating where we should snap the mouse to,
 * and teleporting if clicked.
 */
function snapPointerWorld(world: Coords): Snap | undefined {
	const pointerCoords = space.convertWorldSpaceToCoords(world);
	const gamefile = gameslot.getGamefile()!;


	const drawnRays = annotations.getRays();
	const rayColor = preferences.getAnnoteSquareColor();
	rayColor[3] = 1; // Highlightlines are fully opaque
	const rayLines = drawrays.getLines(drawnRays, rayColor);

	const presetRays = drawrays.getPresetRays();
	const presetRayColor: Color = [...drawrays.PRESET_RAY_COLOR];
	presetRayColor[3] = 1; // Highlightlines are fully opaque
	const presetRayLines = drawrays.getLines(presetRays, presetRayColor);

	const selectedPieceLegalMovesLines = selectedpiecehighlightline.getLines();


	const allLines: Line[] = [...rayLines, ...presetRayLines, ...selectedPieceLegalMovesLines];
	if (allLines.length === 0) return; // No lines to have snap

	const snapDistVPixels = ENTITY_WIDTH_VPIXELS * 0.5;
	const snapDistWorld = space.convertPixelsToWorldSpace_Virtual(snapDistVPixels);
	const snapDistCoords = snapDistWorld / boardpos.getBoardScale();

	// First see if the pointer is even CLOSE to any of these lines,
	// as otherwise we can't snap to anything anyway.
	const linesSnapPoints: LineSnapPoint[] = allLines.map(line => {
		const snapPoint = math.closestPointOnLineSegment(line.start, line.end, pointerCoords);
		return { line, snapPoint };
	});

	let closestSnap: LineSnapPoint = linesSnapPoints[0]!;
	for (const lineSnapPoint of linesSnapPoints) {
		if (lineSnapPoint.snapPoint.distance < closestSnap.snapPoint.distance) closestSnap = lineSnapPoint;
	}

	if (closestSnap.snapPoint.distance > snapDistCoords) {
		// console.log("pointer no close snap");
		return; // No line close enough for the pointer to snap to anything
	}

	// At this point we know we WILL be snapping to something.

	// Filter out lines which the mouse is too far away from
	const closeLines = linesSnapPoints.filter(lsp => lsp.snapPoint.distance <= snapDistCoords);

	/**
	 * Next, calculate all intersection points of all highlight lines (drawn rays, preset rays, and legal moves),
	 * and see if the mouse is close enough to snap to them.
	 * 
	 * If so, those take priority.
	 */

	type Intersection = {
		coords: Coords,
		line1: Line,
		line2: Line,
	}

	const line_intersections: Intersection[] = [];
	for (let a = 0; a < closeLines.length - 1; a++) {
		const line1 = closeLines[a]!;
		for (let b = a + 1; b < closeLines.length; b++) {
			const line2 = closeLines[b]!;
			// Calculate where they intersect
			const intsect = math.intersectLineSegments(line1.line.start, line1.line.end, line2.line.start, line2.line.end);
			if (intsect === undefined) continue; // Don't intersect
			// Push it to the intersections, preventing duplicates
			if (!line_intersections.some(i => coordutil.areCoordsEqual(i.coords, intsect))) line_intersections.push({
				coords: intsect,
				line1: line1.line,
				line2: line2.line
			});
		}
	}

	// Calculate closest one to the pointer

	let closestIntsect: { intersection: Intersection, dist: number } | undefined;
	for (const i of line_intersections) {
		// Calculate distance to mouse
		const dist = math.euclideanDistance(i.coords, pointerCoords);
		if (closestIntsect === undefined || dist < closestIntsect.dist) closestIntsect = { intersection: i, dist };
	}

	if (closestIntsect && closestIntsect.dist <= snapDistCoords) {
		// SNAP to this line intersection, and exit! It takes priority

		// If one of the lines `piece` is defined, set the snap's type to that piece.
		const type = closestIntsect.intersection.line1.piece ?? closestIntsect.intersection.line2.piece;

		// Blend the colors of the two lines
		const color1 = closestIntsect.intersection.line1.color;
		const color2 = closestIntsect.intersection.line2.color;
		const color: Color = [
			(color1[0] + color2[0]) / 2,
			(color1[1] + color2[1]) / 2,
			(color1[2] + color2[2]) / 2,
			(color1[3] + color2[3]) / 2
		];
		
		return { coords: closestIntsect.intersection.coords, color, type };
	}

	/**
	 * At this point, there is no intersections  of lines to snap to.
	 * 
	 * Next, eminate lines in all directions from each entity, seeing where they cross
	 * existing lines, calculating what we should snap to.
	 */

	// Allows snapping to all hippogonals, even the ones in 4D variants.
	// const allPrimitiveSlidesInGame = gamefile.pieces.slides.filter((vector: Vec2) => math.GCD(vector[0], vector[1]) === 1); // Filters out colinears, and thus potential repeats.
	// Minimal snapping vectors
	const searchVectors = gamefile.pieces.hippogonalsPresent ? [...VECTORS, ...VECTORS_HIPPOGONAL] : [...VECTORS];


	// 1. Square Annotes & Intersections of Rays & Ray starts (same priority) ==================

	// All Ray intersections & starts are temporarily added as additional Squares,
	// Including Ray start coords

	const squares = annotations.getSquares();
	const originalSquareLength = squares.length;
	
	// Ray intersections (legal move & rays)
	for (let a = 0; a < allLines.length - 1; a++) {
		const line1 = allLines[a]!;
		for (let b = a + 1; b < allLines.length; b++) {
			const line2 = allLines[b]!;
			// Calculate where they intersect
			const intsect = math.intersectLineSegments(line1.start, line1.end, line2.start, line2.end);
			if (intsect === undefined) continue; // Don't intersect
			// Push it to the intersections, preventing duplicates
			if (!squares.some(c => coordutil.areCoordsEqual(c, intsect))) squares.push(intsect);
		}
	}

	// Add all ray start coords too, including preset ray starts
	const rayStarts = [...drawnRays.map(r => r.start), ...presetRays.map(r => r.start)];
	for (const start of rayStarts) {
		// Don't add duplicates
		if (!squares.some(c => coordutil.areCoordsEqual(c, start))) squares.push(start);
	}
	
	// Now see if we should snap to any "Square"

	const closestSquareSnap = findClosestEntityOfGroup(squares, closeLines, pointerCoords, searchVectors);
	if (closestSquareSnap) {
		// Is the snap within snapping distance of the mouse?
		if (closestSquareSnap.dist < snapDistCoords) {
			squares.length = originalSquareLength; // Remove the temporary squares we added for ray intersections
			return closestSquareSnap.snap;
		}
	}
	squares.length = originalSquareLength; // Remove the temporary squares we added for ray intersections

	// 2. Pieces ========================================

	// Only snap to these if there isn't too many pieces (slow)
	if (boardutil.getPieceCountOfGame(gamefile.pieces) < THRESHOLD_TO_SNAP_PIECES) {
		const pieces = boardutil.getCoordsOfAllPieces(gamefile.pieces);
		const closestPieceSnap = findClosestEntityOfGroup(pieces, closeLines, pointerCoords, searchVectors);
		if (closestPieceSnap) {
			// Is the snap within snapping distance of the mouse?
			if (closestPieceSnap.dist < snapDistCoords) return closestPieceSnap.snap;
		}
	}

	// 3. Origin (Center of Play) ==============================

	const startingBox = gamefileutility.getStartingAreaBox(gamefile);
	const origin = math.calcCenterOfBoundingBox(startingBox);
	const closestOriginSnap = findClosestEntityOfGroup([origin], closeLines, pointerCoords, searchVectors);
	if (closestOriginSnap) {
		// Is the snap within snapping distance of the mouse?
		if (closestOriginSnap.dist < snapDistCoords) return closestOriginSnap.snap;
	}

	// No snap found! ===========================================

	// Instead, set the snap to the closest point on the line.
	return { coords: closestSnap.snapPoint.coords, color: closestSnap.line.color, type: closestSnap.line.piece };
}

function teleportToSnapIfClicked() {
	if (!isSnappingEnabledThisFrame()) return undefined;
	
	if (mouse.isMouseClicked(Mouse.LEFT) || mouse.isMouseDown(Mouse.LEFT)) {
		const world = mouse.getMouseWorld(Mouse.LEFT)!;
		const snap = snapPointerWorld(world);
		if (snap === undefined) return; // No snap to teleport to
		if (mouse.isMouseClicked(Mouse.LEFT)) {
			mouse.claimMouseClick(Mouse.LEFT);
			transition.initTransitionToCoordsList([snap.coords]);
		} else if (mouse.isMouseDown(Mouse.LEFT) && listener_overlay.getPointerCount() !== 2) {
			mouse.claimMouseDown(Mouse.LEFT); // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
		}
	}
}

/**
 * Finds the entity which snapping point to a line near the mouse is closest to the mouse.
 * Eminates lines from each entity in all directions, and checks if they intersect any of the lines close to the mouse.
 */
function findClosestEntityOfGroup(entities: Coords[], closeLines: LineSnapPoint[], mouseCoords: Coords, searchVectors: Vec2[]): { snap: Snap, dist: number } | undefined {
	
	let closestEntitySnap: { snap: Snap, dist: number } | undefined;

	for (const entityCoords of entities) {
		// Eminate lines in all directions from the entity coords
		const eminatingLines = searchVectors.map(l => math.getLineGeneralFormFromCoordsAndVec(entityCoords, l));

		// Calculate their intersections with each individual line close to the mouse
		for (const eminatedLine of eminatingLines) {
			for (const highlightLine of closeLines) {
				// Do they intersect?
				const intersection = math.intersectLineAndSegment(...eminatedLine, highlightLine.line.start, highlightLine.line.end);
				if (intersection === undefined) continue;
				// They DO intersect.
				const dist = math.euclideanDistance(intersection, mouseCoords);
				// Is the intersection point closer to the mouse than the previous closest snap?
				// const intersectionWorld = space.convertCoordToWorldSpace(intersection);
				if (closestEntitySnap === undefined || dist < closestEntitySnap.dist) {
					const snap = { coords: intersection, color: highlightLine.line.color, type: highlightLine.line.piece, source: [...entityCoords] as Coords };
					closestEntitySnap = { snap, dist };
				}
			}
		}
	}

	return closestEntitySnap;
}


// Rendering --------------------------------------------------------------


/**
 * Snapping is in charge of rendering either a glow dot on the snap point,
 * or a mini image of a piece on the legal move line.
 */
function render() {
	if (!isSnappingEnabledThisFrame()) return undefined;

	const allPointerWorlds = mouse.getRelevantListener().getAllPointerIds().map(id => mouse.getPointerWorld(id)!);
	const allSnaps: Snap[] = [];
	for (const pointerWorld of allPointerWorlds) {
		const snap = snapPointerWorld(pointerWorld);
		if (snap !== undefined) allSnaps.push(snap);
	}

	if (allSnaps.length === 0) return; // No snaps to render

	for (const snap of allSnaps) {
		// Render a single line between the snap point and its source
	
		if (snap.source !== undefined) {
			const [r,g,b,a] = SNAP_LINE_COLOR;
			const start = space.convertCoordToWorldSpace(snap.source);
			const end = space.convertCoordToWorldSpace(snap.coords);
			const data = [
				//   Vertex              Color
				start[0], start[1],   r, g, b, a,
				end[0], end[1],       r, g, b, a
			];
			createModel(data, 2, 'LINES', true).render();
		}
	
		// Next we render either the glow dot or the mini image of the piece.
	
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
}

/** TODO: Dont use the spritesheet */
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
	VECTORS,
	VECTORS_HIPPOGONAL,
	getEntityWidthWorld,

	isWorldHoveringAtleastOneEntity,
	getClosestEntityToWorld,
	teleportToEntitiesIfClicked,

	getWorldSnapCoords,
	teleportToSnapIfClicked,
	render,
};