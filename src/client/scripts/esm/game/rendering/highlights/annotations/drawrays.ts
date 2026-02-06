// src/client/scripts/esm/game/rendering/highlights/annotations/drawrays.ts

/**
 * This script allows the user to draw rays on the board.
 *
 * Helpful for analysis.
 */

import type { Color } from '../../../../../../../shared/util/math/math.js';

import variant from '../../../../../../../shared/chess/variants/variant.js';
import bdcoords from '../../../../../../../shared/chess/util/bdcoords.js';
import geometry, { BaseRay } from '../../../../../../../shared/util/math/geometry.js';
import vectors, { Ray, Vec3 } from '../../../../../../../shared/util/math/vectors.js';
import coordutil, {
	BDCoords,
	Coords,
	DoubleCoords,
} from '../../../../../../../shared/chess/util/coordutil.js';

import space from '../../../misc/space.js';
import mouse from '../../../../util/mouse.js';
import meshes from '../../meshes.js';
import snapping from '../snapping.js';
import gameslot from '../../../chess/gameslot.js';
import boardpos from '../../boardpos.js';
import { Mouse } from '../../../input.js';
import preferences from '../../../../components/header/preferences.js';
import annotations from './annotations.js';
import legalmovemodel from '../legalmovemodel.js';
import highlightline, { Line } from '../highlightline.js';
import selectedpiecehighlightline from '../selectedpiecehighlightline.js';

// Variables -----------------------------------------------------------------

/** The color of preset rays for the variant. */
const PRESET_RAY_COLOR: Color = [1, 0.2, 0, 0.24]; // Default: 0.18   Transparent orange (makes preset rays less noticeable/distracting)

/**
 * The preset ray overrides if provided from the ICN.
 * These override the variant's preset rays.
 */
let preset_rays: BaseRay[] | undefined;

/** This will be defined if we are CURRENTLY drawing a ray. */
let drag_start: Coords | undefined;
/** The ID of the pointer that is drawing the ray. */
let pointerId: string | undefined;
/** The last known position of the pointer drawing a ray. */
let pointerWorld: DoubleCoords | undefined;

// Getters -------------------------------------------------------------------

/** Whether a ray is currently being drawn. */
function areDrawing(): boolean {
	return drag_start !== undefined;
}

/** Returns all the preset rays in the current variant. */
function getPresetRays(): Ray[] {
	const baseRays =
		preset_rays ?? variant.getRayPresets(gameslot.getGamefile()!.basegame.metadata.Variant);
	// Maps a list of plain rays to a new Ray list that contains their line coefficient info.
	return baseRays.map((r) => {
		return {
			start: r.start,
			vector: r.vector,
			line: vectors.getLineGeneralFormFromCoordsAndVec(r.start, r.vector),
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
function update(rays: Ray[]): void {
	const respectiveListener = mouse.getRelevantListener();

	if (!drag_start) {
		// Not currently drawing a ray
		if (mouse.isMouseDoubleClickDragged(Mouse.RIGHT)) {
			// Double click drag this frame
			mouse.claimMouseDown(Mouse.RIGHT); // Claim to prevent the same pointer dragging the board
			pointerId = respectiveListener.getMouseId(Mouse.RIGHT)!;
			pointerWorld = mouse.getPointerWorld(pointerId!);
			if (!pointerWorld) return stopDrawing(); // Could have double click dragged while looking into sky?

			const closestEntityToWorld = snapping.getClosestEntityToWorld(pointerWorld);
			const snapCoords = snapping.getWorldSnapCoords(pointerWorld);

			if ((boardpos.areZoomedOut() && closestEntityToWorld) || snapCoords) {
				if (snapCoords) drag_start = coordutil.copyCoords(snapCoords);
				else if (closestEntityToWorld) {
					// Snap to nearest hovered entity
					drag_start = coordutil.copyCoords(closestEntityToWorld.coords);
				} else throw Error('How did we get here?');
			} else {
				// No snap
				drag_start = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
			}
			// console.log("Ray drag start:", drag_start);
		}
	} else {
		// Currently drawing a ray

		// Test if pointer released (finalize ray)
		// If not released, delete any Square present on the Ray start
		if (respectiveListener.pointerExists(pointerId!))
			pointerWorld = mouse.getPointerWorld(pointerId!); // Update its last known position
		if (respectiveListener.isPointerHeld(pointerId!)) {
			// Pointer is still holding
			if (!pointerWorld) return; // Maybe we're looking into sky?
			const pointerCoords = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
			// If the mouse coords is different from the drag start, now delete any Squares off of the start coords of the ray.
			// This prevents the start coord from being highlighted too opaque.
			if (!coordutil.areCoordsEqual(pointerCoords, drag_start!)) {
				const squares = annotations.getSquares();
				const index = squares.findIndex((coords) =>
					coordutil.areCoordsEqual(coords, drag_start!),
				);
				if (index !== -1) {
					squares.splice(index, 1); // Remove the square highlight
					// console.log("Removed square highlight.");
				}
			}
		} else {
			// The pointer is no longer being held
			// Prevents accidentally ray drawing if we intend to draw square
			if (!mouse.isMouseClicked(Mouse.RIGHT)) {
				addDrawnRay(rays); // Finalize the ray
				dispatchRayCountEvent(rays);
			}
			stopDrawing();
		}
	}
}

function getPointerId(): string {
	if (!pointerId)
		throw Error(
			"Pointer ID is undefined. Don't call drawrays.getPointerId() if not drawing a ray.",
		);
	return pointerId;
}

function stopDrawing(): void {
	drag_start = undefined;
	pointerId = undefined;
	pointerWorld = undefined;
}

/** If the given pointer is currently being used to draw a ray, this stops using it. */
function stealPointer(pointerIdToSteal: string): void {
	if (pointerId !== pointerIdToSteal) return; // Not the pointer drawing the ray, don't stop using it.
	stopDrawing();
}

/** Returns all the Rays converted to Lines, which are rendered easily. */
function getLines(rays: Ray[], color: Color): Line[] {
	const boundingBox = highlightline.getRenderRange();

	const lines: Line[] = [];
	for (const ray of rays) {
		const rayStartBD = bdcoords.FromCoords(ray.start);

		// Find the points it intersects the screen
		const intersectionPoints = geometry.findLineBoxIntersectionsBD(
			rayStartBD,
			ray.vector,
			boundingBox,
		);
		if (intersectionPoints.length < 2) continue; // Ray has no intersections with screen, not visible, don't render.
		if (
			!intersectionPoints[0]!.positiveDotProduct &&
			!intersectionPoints[1]!.positiveDotProduct
		)
			continue; // Ray STARTS off screen and goes in the opposite direction. Not visible.

		const start = intersectionPoints[0]!.positiveDotProduct
			? intersectionPoints[0]!.coords
			: rayStartBD;

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
function addDrawnRay(rays: Ray[]): { added: boolean; deletedRays?: Ray[] } {
	if (!pointerWorld) return { added: false }; // Probably stopped drawing while looking into sky?

	const drag_end = space.convertWorldSpaceToCoords_Rounded(pointerWorld);

	// Skip if end equals start (no ray drawn)
	if (coordutil.areCoordsEqual(drag_start!, drag_end)) return { added: false };

	// const vector_unnormalized = coordutil.subtractCoords(drag_end, drag_start!);
	const mouseTileCoords = space.convertWorldSpaceToCoords(pointerWorld);
	const vector_unnormalized = coordutil.subtractBDCoords(
		mouseTileCoords,
		bdcoords.FromCoords(drag_start!),
	);
	const vector = findClosestPredefinedVector(
		vector_unnormalized,
		gameslot.getGamefile()!.boardsim.pieces.hippogonalsPresent,
	);
	const line = vectors.getLineGeneralFormFromCoordsAndVec(drag_start!, vector);

	const deletedRays: Ray[] = [];

	// If any existing rays are coincident, remove those.
	for (let i = rays.length - 1; i >= 0; i--) {
		// Iterate backwards since we're modifying the list as we go
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
		if (vectors.areLinesInGeneralFormEqual(line, line2)) {
			// Coincident
			// Calculate the dot product the ray's vectors.
			// If it's positive, they point in the same direction, otherwise opposite.
			const dotProd = vectors.dotProduct(vector, ray.vector);
			if (dotProd > 0) {
				// Positive, they point in same direction
				// Which one is contained in the other?
				const vecToComparingRayStart = coordutil.subtractCoords(ray.start, drag_start!);
				const dotProd2 = vectors.dotProduct(vector, vecToComparingRayStart);
				if (dotProd2 > 0) {
					// Positive = comparing ray is contained within the new ray
					// Remove this comparing ray in favor of the new one
					rays.splice(i, 1);
					deletedRays.push(ray);
					// console.log("Removed ray in favor of new.");
				} else {
					// Skip adding the new one (it already exists contained in this comparing one)
					// console.log("Ray is already contained in another.");
					if (deletedRays.length > 0)
						throw Error(
							'Should not be any rays deleted if ray to be added is contained within another!',
						);
					return { added: false };
				}
			} else {
				// Negative, they point in opposite directions
				// Keep both
				console.log('Rays point in opposite directions.');
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
function findClosestPredefinedVector(targetVector: BDCoords, searchHippogonals: boolean): Coords {
	// Since the targetVector can be arbitrarily large, we need to normalize it
	// NEAR the range 0-1 (don't matter if it's not exact) so that we can use javascript numbers.
	const normalizedVector = vectors.normalizeVectorBD(targetVector);

	// Now we can use small numbers
	const targetAngle = Math.atan2(normalizedVector[1], normalizedVector[0]); // Y value first

	// prettier-ignore
	const searchVectors: Coords[] = searchHippogonals ? [
		...vectors.VECTORS_ORTHOGONAL,
		...vectors.VECTORS_DIAGONAL,
		...vectors.VECTORS_HIPPOGONAL
	] : [
		...vectors.VECTORS_ORTHOGONAL,
		...vectors.VECTORS_DIAGONAL
	];
	// Add the negation of all vectors
	for (let i = searchVectors.length - 1; i >= 0; i--) {
		searchVectors.push(vectors.negateVector(searchVectors[i]!));
	}

	let minAbsoluteAngleDifference = Infinity;
	// Initialize with the first vector
	let closestVector: Coords = searchVectors[0]!;

	for (const predefinedVector of searchVectors) {
		const predifinedVectorDouble: DoubleCoords =
			vectors.convertVectorToDoubles(predefinedVector);
		const angle = Math.atan2(predifinedVectorDouble[1], predifinedVectorDouble[0]);
		// Calculate the difference in angles
		let angleDifferenceRad = targetAngle - angle;

		// Normalize angleDifferenceRad to the shortest signed angle in the range [-PI, PI].
		// This ensures that angles like -179 deg and 179 deg are considered close (2 deg diff), not far (358 deg diff).
		// Example: diff = 350 deg (almost 2PI). Normalized: -10 deg.
		//          diff = -350 deg. Normalized: 10 deg.
		angleDifferenceRad =
			angleDifferenceRad - 2 * Math.PI * Math.round(angleDifferenceRad / (2 * Math.PI));

		const currentAbsoluteAngleDifference = Math.abs(angleDifferenceRad);

		if (currentAbsoluteAngleDifference < minAbsoluteAngleDifference) {
			minAbsoluteAngleDifference = currentAbsoluteAngleDifference;
			closestVector = predefinedVector;
		}
	}

	return closestVector;
}

/**
 * Collapses all existing rays into a list of intersection coords points.
 *
 * This includes all drawn ray starts, all intersections between drawn & all rays,
 * and all intersections between drawn rays and the selected piece's legal move rays/segments.
 */
function collapseRays(rays_drawn: Ray[], trimDecimals: boolean): BDCoords[] {
	const intersections: BDCoords[] = [];

	const rays_preset = getPresetRays();
	const rays_all: Ray[] = [...rays_drawn, ...rays_preset];

	if (rays_all.length === 0) return intersections;

	// First add the start coords of all rays to the list of intersections
	for (const ray of rays_drawn) addSquare_NoDuplicates(bdcoords.FromCoords(ray.start));

	// Then add all the intersection points of the rays (drawn against drawn + preset, SKIP preset against preset)
	for (let a = 0; a < rays_drawn.length; a++) {
		const ray1 = rays_drawn[a]!; // Gauranteed drawn ray
		for (let b = a + 1; b < rays_all.length; b++) {
			const ray2 = rays_all[b]!; // Could be drawn or preset ray

			// Calculate where they intersect
			const intsect = geometry.intersectRays(ray1, ray2);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (trimDecimals && !bdcoords.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.
			// OPTIONAL: Floor() the coords and add it anyway, even if not integer.
			// intsect = space.roundCoords(intsect);

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
	}

	// Add all the intersection points of the drawn rays with all
	// the components of the selected piece's legal move lines.

	const { rays: selectedPieceRays, segments: selectedPieceSegments } =
		selectedpiecehighlightline.getLineComponents();

	for (const ray of rays_all) {
		// Selected piece legal move RAYS
		for (const legalRay of selectedPieceRays) {
			const intsect = geometry.intersectRays(ray, legalRay);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (trimDecimals && !bdcoords.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
		// Selected piece legal move SEGMENTS
		for (const segment of selectedPieceSegments) {
			const intsect = geometry.intersectRayAndSegment(ray, segment.start, segment.end);
			if (intsect === undefined) continue; // No intersection, skip.

			// Verify the intersection point is an integer
			if (trimDecimals && !bdcoords.areCoordsIntegers(intsect)) continue; // Not an integer, don't collapse.

			// Push it to the collapsed coord intersections if there isn't a duplicate already
			addSquare_NoDuplicates(intsect);
		}
	}

	function addSquare_NoDuplicates(coords: BDCoords): void {
		if (intersections.every((coords2) => !coordutil.areBDCoordsEqual(coords, coords2)))
			intersections.push(coords);
	}

	return intersections;
}

function dispatchRayCountEvent(rays: Ray[]): void {
	document.dispatchEvent(new CustomEvent('ray-count-change', { detail: rays.length }));
}

/**
 * Sets the preset rays, if they were specified in the ICN.
 * These override the variant's preset rays.
 */
function setPresetOverrides(prs: BaseRay[]): void {
	if (preset_rays)
		throw Error('Preset rays already initialized. Did you forget to clearPresetOverrides()?');
	preset_rays = prs;
}

/** Returns the preset ray overrides from the ICN. */
function getPresetOverrides(): BaseRay[] | undefined {
	return preset_rays;
}

/** Clears the preset ray overrides from the ICN. */
function clearPresetOverrides(): void {
	preset_rays = undefined;
}

// Rendering -----------------------------------------------------------------

/** Renders all existing rays, including preset rays. */
function render(rays: Ray[]): void {
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
function genAndRenderRays(rays: Ray[], color: Color): void {
	if (rays.length === 0) return; // Nothing to render

	if (boardpos.areZoomedOut()) {
		// Zoomed out, render rays as highlight lines
		color[3] = 1; // Highlightlines are fully opaque
		const lines = getLines(rays, color);
		highlightline.genLinesModel(lines).render();
	} else {
		// Zoomed in, render rays as infinite legal move highlights
		const boardPos: BDCoords = boardpos.getBoardPos();
		const model_Offset: Coords = legalmovemodel.getOffset();
		const position = meshes.getModelPosition(boardPos, model_Offset, 0);
		const boardScale: number = boardpos.getBoardScaleAsNumber();
		const scale: Vec3 = [boardScale, boardScale, 1];

		legalmovemodel.genModelForRays(rays, color).render(position, scale);
	}
}

// Exports -------------------------------------------------------------------

export default {
	PRESET_RAY_COLOR,
	areDrawing,
	getPresetRays,
	update,
	getPointerId,
	stealPointer,
	stopDrawing,
	getLines,
	findClosestPredefinedVector,
	collapseRays,
	dispatchRayCountEvent,
	setPresetOverrides,
	getPresetOverrides,
	clearPresetOverrides,
	render,
};
