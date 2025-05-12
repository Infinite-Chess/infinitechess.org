
/**
 * This script allows the user to draw rays on the board.
 * 
 * Helpful for analysis.
 */


import preferences from "../../../../components/header/preferences.js";
import snapping from "../snapping.js";
import coordutil from "../../../../chess/util/coordutil.js";
import space from "../../../misc/space.js";
import math, { Vec2 } from "../../../../util/math.js";
import legalmovehighlights from "../legalmovehighlights.js";
import instancedshapes from "../../instancedshapes.js";
import { AttributeInfoInstanced, createModel_Instanced_GivenAttribInfo } from "../../buffermodel.js";
import gameslot from "../../../chess/gameslot.js";
import highlightline, { Line } from "../highlightline.js";
import { Mouse } from "../../../input.js";
import boardpos from "../../boardpos.js";
import mouse from "../../../../util/mouse.js";
import annotations from "./annotations.js";


import type { Coords } from "../../../../chess/util/coordutil.js";
import type { Ray } from "./annotations.js";


// Variables -----------------------------------------------------------------


/** All vectors we are gauranteed to be able to draw Rays on. */
const VECTORS: Coords[] = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
/** {@link VECTORS} but with hippogonals as well. */
const VECTORS_HIPPOGONAL: Coords[] = [[1,2],[-1,2],[1,-2],[-1,-2],[2,1],[-2,1],[2,-1],[-2,-1]];


const ATTRIB_INFO: AttributeInfoInstanced = {
	vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'color', numComponents: 4 }],
	instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }]
};


/** This will be defined if we are CURRENTLY drawing a ray. */
let drag_start: Coords | undefined;


/**
 * A list this frame for all the rays converted to lines.
 * Read by snapping.ts in the update loop.
 */
const lines: Line[] = [];


// Helpers -------------------------------------------------------------------




// Updating -----------------------------------------------------------------


/**
 * Tests if the user has started/finished drawing new rays,
 * or deleting any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param rays - All ray annotations currently on the board.
 */
function update(rays: Ray[]) {
	if (!drag_start) { // Not currently drawing a ray
		if (mouse.isMouseDoubleClickDragged(Mouse.RIGHT)) { // Double click drag this frame
			const pointerWorld = mouse.getMouseWorld(Mouse.RIGHT)!;
			if (boardpos.areZoomedOut() && snapping.isHoveringAtleastOneEntity()) {
				// Snap to nearest hovered entity
				const nearestEntity = snapping.getClosestEntityToMouse();
				drag_start = coordutil.copyCoords(nearestEntity.coords);
			} else {
				// No snap
				drag_start = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
			}
			// console.log("Ray drag start:", drag_start);
		}
	} else { // Currently drawing a ray
		// Test if mouse released (finalize ray)

		if (mouse.isMouseHeld(Mouse.RIGHT)) {
			// Mouse is still holding
			// If the mouse coords is different from the drag start, now delete any Squares off of the start coords of the ray.
			// This prevents the start coord from being highlighted too opaque.
			const mouseCoords = mouse.getTileMouseOver_Integer(Mouse.RIGHT)!;
			if (!coordutil.areCoordsEqual_noValidate(mouseCoords, drag_start!)) {
				const squares = annotations.getSquares();
				const index = squares.findIndex(coords => coordutil.areCoordsEqual_noValidate(coords, drag_start!));
				if (index !== -1) {
					squares.splice(index, 1); // Remove the square highlight
					// console.log("Removed square highlight.");
				}
			}
		} else if (!mouse.isMouseClicked(Mouse.RIGHT)) { // Prevents accidentally ray drawing if we intend to draw square
			// The mouse is no longer being held, nor a click simulated (Square drawn same frame).
			// Finalize the ray
			addDrawnRay(rays);
			drag_start = undefined; // Reset drawing
		}
	}

	// Recalculate the lines from the rays so that snapping can read them in the update loop...

	lines.length = 0;

	if (!boardpos.areZoomedOut()) return; // Zoomed in, not rendering rays as highlight lines

	const color = preferences.getAnnoteSquareColor();
	color[3] = 1; // Highlightlines are fully opaque

	const boundingBox = highlightline.getRenderRange();
	
	/** Running list of all Lines converted from Rays */
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
}

/**
 * Adds the currently drawn ray to the list.
 * If a matching ray already exists, that will be removed instead.
 * Any coincident rays are removed.
 * @param rays - All rays currently visible on the board.
 * @returns An object containing the results, such as whether a change was made, and what rays were deleted if any.
 */
function addDrawnRay(rays: Ray[]): { added: boolean, deletedRays?: Ray[] } {
	const pointerWorld = mouse.getMouseWorld(Mouse.RIGHT)!;
	const drag_end = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

	// Skip if end equals start (no arrow drawn)
	if (coordutil.areCoordsEqual_noValidate(drag_start!, drag_end)) return { added: false };

	// const vector_unnormalized = coordutil.subtractCoordinates(drag_end, drag_start!);
	const mouseCoords = mouse.getTileMouseOver_Float(Mouse.RIGHT)!;
	const vector_unnormalized = coordutil.subtractCoordinates(mouseCoords, drag_start!);
	const vector = findClosestPredefinedVector(vector_unnormalized, gameslot.getGamefile()!.pieces.hippogonalsPresent);
	const line = math.getLineGeneralFormFromCoordsAndVec(drag_start!, vector);

	const deletedRays: Ray[] = [];

	// If any existing rays are coincident, remove those.
	for (let i = rays.length - 1; i >= 0; i--) { // Iterate backwards since we're modifying the list as we go
		const ray = rays[i]!;
		if (!coordutil.areCoordsEqual_noValidate(ray.vector, vector)) continue; // Not parallel (assumes vectors are normalized)
		if (coordutil.areCoordsEqual_noValidate(ray.start, drag_start!)) {
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

	const searchVectors: Coords[] = searchHippogonals ? [...VECTORS, ...VECTORS_HIPPOGONAL] : [...VECTORS];

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
function collapseRays(rays: Ray[]): Coords[] {
	const intersections: Coords[] = [];
	if (rays.length < 1) return intersections;

	// First add the start coords of all rays to the list of intersections
	for (const ray of rays) addSquare_NoDuplicates(ray.start);

	// Then add all the intersection points of the rays
	for (let a = 0; a < rays.length - 1; a++) {
		const ray1 = rays[a]!;
		for (let b = a + 1; b < rays.length; b++) {
			const ray2 = rays[b]!;
			// Calculate where they intersect
			const intsect = math.calcIntersectionPointOfLines(...ray1.line, ...ray2.line);
			if (intsect === undefined) continue; // Parallel or coincident, can't collapse into an intersection coord.

			// Make sure both dot products are positive, the rays pointing in the direction
			// of the intersection, since the  rays are mathematical rays, not infinite lines.
			const vec1 = math.calculateVectorFromPoints(ray1.start, intsect); // The vector pointing towards the intersection.
			const dp1 = math.dotProduct(ray1.vector, vec1);
			const vec2 = math.calculateVectorFromPoints(ray2.start, intsect); // The vector pointing towards the intersection.
			const dp2 = math.dotProduct(ray2.vector, vec2);

			if (dp1 < 0 || dp2 < 0) continue; // One or both rays point away from the intersection point. Don't collapse.

			// Verify the intersection point is an integer
			if (!coordutil.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
	}

	function addSquare_NoDuplicates(coords: Coords) {
		if (intersections.every(coords2 => !coordutil.areCoordsEqual_noValidate(coords, coords2))) intersections.push(coords);
	}

	return intersections;
}


// Rendering -----------------------------------------------------------------



function render(rays: Ray[]) {
	// Add the ray currently being drawn
	const drawingCurrentlyDrawn = drag_start ? addDrawnRay(rays) : { added: false };

	// Early exit if no rays to draw
	if (rays.length > 0) {
		if (boardpos.areZoomedOut()) { // Zoomed out, render rays as highlight lines
			if (lines.length === 0) throw Error('Lines empty, cannot render ray highlight lines.');
			highlightline.genLinesModel(lines).render();
		} else { // Zoomed in, render rays as infinite legal move highlights
			const color = preferences.getAnnoteSquareColor();
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

	// Remove the ray currently being drawn
	if (drawingCurrentlyDrawn.added) rays.pop();
	// Restore the deleted rays if any
	if (drawingCurrentlyDrawn.deletedRays && drawingCurrentlyDrawn.deletedRays.length > 0) rays.push(...drawingCurrentlyDrawn.deletedRays);
}


// Exports -------------------------------------------------------------------


export default {
	lines,
	update,
	collapseRays,
	render,
};