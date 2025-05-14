
/**
 * This script allows the user to draw rays on the board.
 * 
 * Helpful for analysis.
 */


// @ts-ignore
import perspective from "../../perspective.js";
import preferences from "../../../../components/header/preferences.js";
import snapping from "../snapping.js";
import coordutil, { Coords } from "../../../../chess/util/coordutil.js";
import space from "../../../misc/space.js";
import math, { Color, Vec2 } from "../../../../util/math.js";
import legalmovehighlights from "../legalmovehighlights.js";
import instancedshapes from "../../instancedshapes.js";
import { AttributeInfoInstanced, createModel_Instanced_GivenAttribInfo } from "../../buffermodel.js";
import gameslot from "../../../chess/gameslot.js";
import highlightline, { Line } from "../highlightline.js";
import { InputListener, Mouse } from "../../../input.js";
import boardpos from "../../boardpos.js";
import mouse from "../../../../util/mouse.js";
import annotations, { Ray } from "./annotations.js";
import selectedpiecehighlightline from "../selectedpiecehighlightline.js";
import variant from "../../../../chess/variants/variant.js";
import { listener_document, listener_overlay } from "../../../chess/game.js";


// Variables -----------------------------------------------------------------


/** The color of preset rays for the variant. */
const PRESET_RAY_COLOR: Color = [0, 0, 1, 0.35];

const ATTRIB_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'color', numComponents: 4 }],
	instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }]
};


/** This will be defined if we are CURRENTLY drawing a ray. */
let drag_start: Coords | undefined;

/** The ID of the pointer that is drawing the ray. */
let pointerId: string | undefined;


// Getters -------------------------------------------------------------------


/** Whether a ray is currently being drawn. */
function areDrawing() {
	return drag_start !== undefined;
}

/** Returns all the preset rays in the current variant. */
function getPresetRays(): Ray[] {
	const baseRays = variant.getRayPresets(gameslot.getGamefile()!.metadata.Variant);
	// Maps a list of plain rays to a new Ray list that contains their line coefficient info.
	return baseRays.map(r => {
		return {
			start: r.start,
			vector: r.vector,
			line: math.getLineGeneralFormFromCoordsAndVec(r.start, r.vector)
		};
	});
}


// Updating -----------------------------------------------------------------


/**
 * Tests if the user has started/finished drawing new rays,
 * or deleting any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param rays - All ray annotations currently on the board.
 */
function update(rays: Ray[]) {
	const respectiveListener = perspective.getEnabled() ? listener_document : listener_overlay;

	if (!drag_start) { // Not currently drawing a ray
		if (mouse.isMouseDoubleClickDragged(Mouse.RIGHT)) { // Double click drag this frame
			const pointerWorld = mouse.getMouseWorld(Mouse.RIGHT)!;

			const snappingAtleastOneEntity = snapping.isHoveringAtleastOneEntity();
			const snapCoords = snapping.getSnapCoords();

			if (boardpos.areZoomedOut() && snappingAtleastOneEntity || snapCoords) {
				if (snapCoords) drag_start = coordutil.copyCoords(snapCoords);
				else {
					// Snap to nearest hovered entity
					const nearestEntity = snapping.getClosestEntityToMouse();
					drag_start = coordutil.copyCoords(nearestEntity.coords);
				}
			} else {
				// No snap
				drag_start = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
			}
			pointerId = respectiveListener.getMouseId(Mouse.RIGHT);
			// console.log("Ray drag start:", drag_start);
		}
	} else { // Currently drawing a ray
		
		// Prevent accidental ray drawing when trying to zoom.
		if (listener_overlay.getPointersDownCount() > 0 && listener_overlay.getPointerCount() === 2) {
			// Unclaim the pointer so that board dragging may capture it again to initiate a pinch.
			listener_overlay.unclaimPointerDown(pointerId!);
			stopDrawing();
			return;
		}

		// Test if pointer released (finalize ray)
		// If not released, delete any Square present on the Ray start
		const pointer = respectiveListener.getPointer(pointerId!);
		if (pointer?.isHeld) { // Pointer is still holding
			// If the mouse coords is different from the drag start, now delete any Squares off of the start coords of the ray.
			// This prevents the start coord from being highlighted too opaque.
			const mouseCoords = mouse.getTileMouseOver_Integer(Mouse.RIGHT)!;
			if (!coordutil.areCoordsEqual(mouseCoords, drag_start!)) {
				const squares = annotations.getSquares();
				const index = squares.findIndex(coords => coordutil.areCoordsEqual(coords, drag_start!));
				if (index !== -1) {
					squares.splice(index, 1); // Remove the square highlight
					// console.log("Removed square highlight.");
				}
			}
		} else { // The pointer is no longer being held
			// Prevents accidentally ray drawing if we intend to draw square
			if (!mouse.isMouseClicked(Mouse.RIGHT)) addDrawnRay(rays); // Finalize the ray
			stopDrawing();
		}
	}
}

function stopDrawing() {
	drag_start = undefined;
	pointerId = undefined;
}

/** Returns all the Rays converted to Lines, which are rendered easily. */
function getLines(rays: Ray[], color: Color): Line[] {
	const boundingBox = highlightline.getRenderRange();

	const lines: Line[] = [];
	for (const ray of rays) {
		// Find the points it intersects the screen
		const intersectionPoints = math.findLineBoxIntersections(ray.start, ray.vector, boundingBox);
		if (intersectionPoints.length < 2) continue; // Ray has no intersections with screen, not visible, don't render.
		if (!intersectionPoints[0]!.positiveDotProduct && !intersectionPoints[1]!.positiveDotProduct) continue; // Ray STARTS off screen and goes in the opposite direction. Not visible.

		const start = intersectionPoints[0]!.positiveDotProduct ? intersectionPoints[0]!.coords : ray.start;

		lines.push({
			start,
			end: intersectionPoints[1]!.coords,
			coefficients: ray.line,
			color,
		});
	}

	return lines;
}

/**
 * Adds the currently drawn ray to the list.
 * If a matching ray already exists, that will be removed instead.
 * Any coincident rays are removed.
 * @param rays - All rays currently visible on the board.
 * @returns An object containing the results, such as whether the ray was added, and what rays were deleted if any.
 */
function addDrawnRay(rays: Ray[]): { added: boolean, deletedRays?: Ray[] } {
	const pointerWorld = mouse.getMouseWorld(Mouse.RIGHT)!;
	const drag_end = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

	// Skip if end equals start (no ray drawn)
	if (coordutil.areCoordsEqual(drag_start!, drag_end)) return { added: false };

	// const vector_unnormalized = coordutil.subtractCoordinates(drag_end, drag_start!);
	const mouseCoords = mouse.getTileMouseOver_Float(Mouse.RIGHT)!;
	const vector_unnormalized = coordutil.subtractCoordinates(mouseCoords, drag_start!);
	const vector = findClosestPredefinedVector(vector_unnormalized, gameslot.getGamefile()!.pieces.hippogonalsPresent);
	const line = math.getLineGeneralFormFromCoordsAndVec(drag_start!, vector);

	const deletedRays: Ray[] = [];

	// If any existing rays are coincident, remove those.
	for (let i = rays.length - 1; i >= 0; i--) { // Iterate backwards since we're modifying the list as we go
		const ray = rays[i]!;
		if (!coordutil.areCoordsEqual(ray.vector, vector)) continue; // Not parallel (assumes vectors are normalized)
		if (coordutil.areCoordsEqual(ray.start, drag_start!)) {
			// Identical, erase the existing one instead.
			rays.splice(i, 1); // Remove the existing ray
			deletedRays.push(ray);
			// console.log("Erasing ray.");
			return { added: false, deletedRays };
		}
		const line2 = ray.line;
		if (math.areLinesInGeneralFormEqual(line, line2)) { // Coincident
			// Calculate the dot product the ray's vectors.
			// If it's positive, they point in the same direction, otherwise opposite.
			const dotProd = math.dotProduct(vector, ray.vector);
			if (dotProd > 0) { // Positive, they point in same direction
				// Which one is contained in the other?
				const vecToComparingRayStart = coordutil.subtractCoordinates(ray.start, drag_start!);
				const dotProd2 = math.dotProduct(vector, vecToComparingRayStart);
				if (dotProd2 > 0) { // Positive = comparing ray is contained within the new ray
					// Remove this comparing ray in favor of the new one
					rays.splice(i, 1);
					deletedRays.push(ray);
					// console.log("Removed ray in favor of new.");
				} else { // Skip adding the new one (it already exists contained in this comparing one)
					// console.log("Ray is already contained in another.");
					if (deletedRays.length > 0) throw Error("Should not be any rays deleted if ray to be added is contained within another!");
					return { added: false };
				}
			} else { // Negative, they point in opposite directions
				// Keep both
				console.log("Rays point in opposite directions.");
			}
		}
	}

	// Add the ray
	const ray = { start: drag_start!, vector, line };
	rays.push(ray);
	// console.log("Added ray:", ray);
	return { added: true, deletedRays };
}

/**
 * Finds the VECTOR whose angle most closely matches the angle of the given targetVector.
 * This helps us snap the ray's direction to a slide direction in the game.
 */
function findClosestPredefinedVector(targetVector: Vec2, searchHippogonals: boolean): Coords {
	const targetAngle = Math.atan2(targetVector[1], targetVector[0]);

	const searchVectors: Coords[] = searchHippogonals ? [...snapping.VECTORS, ...snapping.VECTORS_HIPPOGONAL] : [...snapping.VECTORS];

	let minAbsoluteAngleDifference = Infinity;
	// Initialize with the first vector
	let closestVector: Coords = searchVectors[0]!; 

	for (const predefinedVector of searchVectors) {
		const angle = Math.atan2(predefinedVector[1], predefinedVector[0]);
		// Calculate the difference in angles
		let angleDifferenceRad = targetAngle - angle;

		// Normalize angleDifferenceRad to the shortest signed angle in the range [-PI, PI].
		// This ensures that angles like -179 deg and 179 deg are considered close (2 deg diff), not far (358 deg diff).
		// Example: diff = 350 deg (almost 2PI). Normalized: -10 deg.
		//          diff = -350 deg. Normalized: 10 deg.
		angleDifferenceRad = angleDifferenceRad - (2 * Math.PI) * Math.round(angleDifferenceRad / (2 * Math.PI));
        
		const currentAbsoluteAngleDifference = Math.abs(angleDifferenceRad);

		if (currentAbsoluteAngleDifference < minAbsoluteAngleDifference) {
			minAbsoluteAngleDifference = currentAbsoluteAngleDifference;
			closestVector = predefinedVector;
		}
	}

	return closestVector;
}

/** Collapses all existing rays into a list of intersection coords points. */
function collapseRays(rays_drawn: Ray[]): Coords[] {
	const intersections: Coords[] = [];

	const rays_preset = getPresetRays();
	const rays_all: Ray[] = [...rays_drawn, ...rays_preset];

	if (rays_all.length === 0) return intersections;

	// First add the start coords of all rays to the list of intersections
	for (const ray of rays_drawn) addSquare_NoDuplicates(ray.start);

	// Then add all the intersection points of the rays
	for (let a = 0; a < rays_drawn.length; a++) {
		const ray1 = rays_drawn[a]!; // Gauranteed drawn ray
		for (let b = a + 1; b < rays_all.length; b++) {
			const ray2 = rays_all[b]!; // Could be drawn or preset ray
			
			// Calculate where they intersect
			const intsect = math.intersectRays(ray1, ray2);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (!coordutil.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.
			// OPTIONAL: Floor() the coords and add it anyway, even if not integer.
			// intsect = space.roundCoords(intsect);

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
	}
	
	// Add all the intersection points of the drawn rays with all
	// the components of the selected piece's legal move lines.

	const { rays: selectedPieceRays, segments: selectedPieceSegments } = selectedpiecehighlightline.getLineComponents();

	for (const ray of rays_all) {
		// Selected piece legal move RAYS
		for (const legalRay of selectedPieceRays) {
			const intsect = math.intersectRays(ray, legalRay);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (!coordutil.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
		// Selected piece legal move SEGMENTS
		for (const segment of selectedPieceSegments) {
			const intsect = math.intersectRayAndSegment(ray, segment.start, segment.end);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (!coordutil.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
	}

	function addSquare_NoDuplicates(coords: Coords) {
		if (intersections.every(coords2 => !coordutil.areCoordsEqual(coords, coords2))) intersections.push(coords);
	}

	return intersections;
}


// Rendering -----------------------------------------------------------------


/** Renders all existing rays, including preset rays. */
function render(rays: Ray[]) {
	// Add the ray currently being drawn
	const drawingCurrentlyDrawn = drag_start ? addDrawnRay(rays) : { added: false };

	const presetRays = getPresetRays();

	const drawnRaysColor = preferences.getAnnoteSquareColor();
	const presetRaysColor: Color = [...PRESET_RAY_COLOR];
	
	genAndRenderRays(rays, drawnRaysColor);
	genAndRenderRays(presetRays, presetRaysColor);

	// Remove the ray currently being drawn
	if (drawingCurrentlyDrawn.added) rays.pop();
	// Restore the deleted rays if any
	if (drawingCurrentlyDrawn.deletedRays) rays.push(...drawingCurrentlyDrawn.deletedRays);
}

/** Generates and renders a model for the given rays and color. */
function genAndRenderRays(rays: Ray[], color: Color) {
	if (rays.length === 0) return; // Nothing to render

	if (boardpos.areZoomedOut()) { // Zoomed out, render rays as highlight lines
		color[3] = 1; // Highlightlines are fully opaque
		const lines = getLines(rays, color);
		highlightline.genLinesModel(lines).render();
	} else { // Zoomed in, render rays as infinite legal move highlights
		// Construct the data
		const vertexData = instancedshapes.getDataLegalMoveSquare(color);
		const instanceData = legalmovehighlights.genData_Rays(rays);
		const model = createModel_Instanced_GivenAttribInfo(vertexData, instanceData, ATTRIB_INFO, 'TRIANGLES');
		// Render
		const boardPos: Coords = boardpos.getBoardPos();
		const model_Offset: Coords = legalmovehighlights.getOffset();
		const position: [number,number,number] = [
			-boardPos[0] + model_Offset[0], // Add the model's offset
			-boardPos[1] + model_Offset[1],
			0
		];
		const boardScale: number = boardpos.getBoardScale();
		const scale: [number,number,number] = [boardScale, boardScale, 1];
		model.render(position, scale);
	}
}


// Exports -------------------------------------------------------------------


export default {
	PRESET_RAY_COLOR,
	areDrawing,
	getPresetRays,
	update,
	stopDrawing,
	getLines,
	collapseRays,
	render,
};