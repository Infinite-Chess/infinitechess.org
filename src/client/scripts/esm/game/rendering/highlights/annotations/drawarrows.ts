
/**
 * This script allows the user to draw arrows on the board.
 * 
 * Helpful for analysis, and requested by many.
 */


import space from "../../../misc/space.js";
import math, { Color } from "../../../../util/math.js";
import preferences from "../../../../components/header/preferences.js";
import { createModel } from "../../buffermodel.js";
// @ts-ignore
import input from "../../../input.js";
// @ts-ignore
import movement from "../../movement.js";


import type { Arrow } from "./annotations.js";
import type { Coords } from "../../../../chess/util/coordutil.js";
import coordutil from "../../../../chess/util/coordutil.js";
import snapping from "../snapping.js";


// Variables -----------------------------------------------------------------


/** Properties for the drawn arrows.*/
const ARROW = {
	/** Width of the arrow's rectangular body, where 1.0 spans a full square. */
	BODY_WIDTH: 0.26,
	/** Width of the base of the arrowhead (perpendicular to arrow direction), where 1.0 spans a full square. */
	TIP_WIDTH: 0.58,
	/** Length of the arrowhead (along arrow direction), where 1.0 spans a full square. */
	TIP_LENGTH: 0.39,
	/**
	 * The minimum desired length of the arrow's body, as a proportion of the total arrow length.
	 * E.g., 0.5 means the body should try to be at least 50% of the total arrow length.
	 * If the arrow is too short for both this proportional body and the ARROW.TIP_LENGTH,
	 * both body and tip lengths will be adjusted.
	 * Valid range: [0.0, 1.0]. 0.0 means no minimum proportional body length is enforced beyond
	 * what's left after the tip takes ARROW.TIP_LENGTH. 1.0 means the arrow tries to be all body.
	 */
	MIN_BODY_PROPORTION: 0.4, // Example: Body should be at least 30% of total arrow length
	/** Offset of the arrow's base from the starting coordinate, in percentage of 1 tile width. */
	BASE_OFFSET: 0.35,
};




/** This will be defined if we are CURRENTLY drawing an arrow. */
let drag_start: Coords | undefined;


// Updating -----------------------------------------------------------------


/**
 * Tests if the user has started/finished drawing new arrows,
 * or deleting any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param arrows - All arrow annotations currently on the board.
 */
function update(arrows: Arrow[]) {
	if (!drag_start) {
		// Test if right mouse down (start drawing)
		if (input.isMouseHeld_Right()) {
			const pointerWorld = input.getPointerWorldLocation() as Coords;
			if (movement.isScaleLess1Pixel_Virtual() && snapping.isHoveringAtleastOneEntity()) {
				// Snap to nearest hovered entity
				const nearestEntity = snapping.getClosestEntityToMouse();
				drag_start = coordutil.copyCoords(nearestEntity.coords);
			} else {
				// No snap
				drag_start = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
			}
		}
	} else { // Currently drawing an arrow
		// Test if mouse released (finalize arrow)
		if (!input.isMouseHeld_Right() && !input.getPointerClicked_Right()) { // Prevents accidentally drawing tincy arrows while zoomed out if we intend to draw square
			addDrawnArrow(arrows);
			drag_start = undefined; // Reset drawing
		}
	}
}

/**
 * Adds the currently drawn arrow to the list.
 * If a matching arrow already exists, that will be removed instead.
 * @param arrows - All arrows currently visible on the board.
 * @returns An object containing the results, such as whether a change was made, and what arrow was deleted if any.
 */
function addDrawnArrow(arrows: Arrow[]): { changed: boolean, deletedArrow?: Arrow } {
	const pointerWorld = input.getPointerWorldLocation() as Coords;
	let drag_end: Coords;
	if (movement.isScaleLess1Pixel_Virtual() && snapping.isHoveringAtleastOneEntity()) {
		// Snap to nearest hovered entity
		const nearestEntity = snapping.getClosestEntityToMouse();
		drag_end = coordutil.copyCoords(nearestEntity.coords);
	} else {
		// No snap
		drag_end = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
	}

	// Skip if end equals start (no arrow drawn)
	if (coordutil.areCoordsEqual_noValidate(drag_start!, drag_end)) return { changed: false };

	// If a matching arrow already exists, remove that instead.
	for (let i = 0; i < arrows.length; i++) {
		const arrow = arrows[i]!;
		if (coordutil.areCoordsEqual_noValidate(arrow.start, drag_start!) && coordutil.areCoordsEqual_noValidate(arrow.end, drag_end)) {
			arrows.splice(i, 1); // Remove the existing arrow
			return { changed: true, deletedArrow: arrow }; // No new arrow added
		}
	}

	// Add the arrow
	arrows.push({ start: drag_start!, end: drag_end });
	return { changed: true };
}

function stopDrawing() {
	drag_start = undefined;
}


// Rendering -----------------------------------------------------------------



function render(arrows: Arrow[]) {
	// Add the arrow currently being drawn
	const drawingCurrentlyDrawn = drag_start ? addDrawnArrow(arrows) : { changed: false};

	// Early exit if no arrows to draw
	if (arrows.length === 0) return;

	// Construct the data
	const color = preferences.getAnnoteArrowColor();
	const data: number[] = arrows.flatMap(arrow => getDataArrow(arrow, color));

	// Render
	createModel(data, 2, 'TRIANGLES', true).render(); // No transform needed

	// Remove the arrow currently being drawn
	if (drawingCurrentlyDrawn.changed) {
		if (drawingCurrentlyDrawn.deletedArrow) arrows.push(drawingCurrentlyDrawn.deletedArrow); // Restore the deleted arrow if any
		else arrows.pop();
	}
}


/**
 * Generates vertex data for a single arrow.
 * @param startWorld - The starting coordinates [x, y] of the arrow's base (world space).
 * @param endWorld - The ending coordinates [x, y] of the arrow's tip (world space).
 * @param color - The color [r, g, b, a] of the arrow.
 * @returns The vertex data for the arrow (x,y, r,g,b,a).
 */
function getDataArrow(
	arrow: Arrow,
	color: Color
): number[] {
	// First we need to shift the arrow's base a little away from the center of the starting square.
	const length_coords = math.euclideanDistance(arrow.start, arrow.end);
	// This makes sure that base offset looks the same no matter our zoom level
	const invMult = movement.isScaleLess1Pixel_Virtual() ? movement.getBoardScale() : 1;
	const t = ARROW.BASE_OFFSET / (invMult * length_coords); // Proportion of the arrow length to offset the base
	if (t >= 1) return []; // No arrow drawn if base offset is greater than the entire arrow length (else it would be drawn with negative length).
	const trueStartCoords = coordutil.lerpCoords(arrow.start, arrow.end, t);

	// Calculate the base and tip world space coordinates
	const startWorld = space.convertCoordToWorldSpace(trueStartCoords);
	const endWorld = space.convertCoordToWorldSpace(arrow.end);

	const [r, g, b, a] = color;
	const vertices: number[] = [];

	const size = movement.isScaleLess1Pixel_Virtual() ? 1 : movement.getBoardScale();

	const bodyWidthArg = ARROW.BODY_WIDTH * size;
	const tipWidthArg = ARROW.TIP_WIDTH * size;
	const desiredTipLength = ARROW.TIP_LENGTH * size;

	const sx = startWorld[0];
	const sy = startWorld[1];
	const ex = endWorld[0];
	const ey = endWorld[1];

	const dx = ex - sx;
	const dy = ey - sy;
	const length = math.euclideanDistance(startWorld, endWorld);

	// Helpers
	const addQuad = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
		vertices.push(x1, y1, r, g, b, a, x2, y2, r, g, b, a, x3, y3, r, g, b, a);
		vertices.push(x3, y3, r, g, b, a, x4, y4, r, g, b, a, x1, y1, r, g, b, a);
	};
	const addTriangle = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
		vertices.push(x1, y1, r, g, b, a, x2, y2, r, g, b, a, x3, y3, r, g, b, a);
	};

	const ndx = dx / length; // Normalized direction vector x
	const ndy = dy / length; // Normalized direction vector y
	const pdx = -ndy; // Perpendicular vector x
	const pdy = ndx; // Perpendicular vector y

	let actualBodyLength: number;
	let actualBodyWidth: number;
	let actualTipLength: number;
	let actualTipWidth: number;

	// --- Calculate actual body and tip lengths based on total length and desired proportions ---

	// Minimum body length based on its desired proportion of the total length.
	const proportionallyMinBodyLength = length * ARROW.MIN_BODY_PROPORTION;

	// Length remaining for the body if the tip takes its full desiredTipLength.
	const bodyLengthIfFullTip = length - desiredTipLength;

	if (bodyLengthIfFullTip >= proportionallyMinBodyLength) {
		// Case 1: Enough space for the full desiredTipLength, AND
		// the remaining body (length - desiredTipLength) meets or exceeds the proportionallyMinBodyLength.
		// This is the "ideal" scenario where the tip gets its desired length.
		actualTipLength = desiredTipLength;
		actualBodyLength = length - actualTipLength;
		actualTipWidth = tipWidthArg; // Tip length is as desired, so tip width is as desired.
		actualBodyWidth = bodyWidthArg;
	} else {
		// Case 2: Not enough space for both full desiredTipLength AND proportionallyMinBodyLength.
		// This is the "constrained" scenario.
		// Body gets its proportionallyMinBodyLength.
		actualBodyLength = proportionallyMinBodyLength;
		// Tip gets the rest of the total length.
		actualTipLength = length - actualBodyLength;
		// Scale body width and tip width based on how their actual length compares to their desired length.
		// desiredTipLength is guaranteed > ARROW_DRAW_THRESHOLD here.
		const ratio = (actualTipLength / desiredTipLength);
		actualBodyWidth = bodyWidthArg * ratio;
		actualTipWidth = tipWidthArg * ratio;
	}

	// Draw Both Body and Tip

	const halfActualTipWidth = actualTipWidth / 2;
	const halfActualBodyWidth = actualBodyWidth / 2;

	// Junction point (where body meets tip base) is 'actualTipLength' back from the end point 'ex, ey'.
	const tipBaseCenterX = ex - ndx * actualTipLength;
	const tipBaseCenterY = ey - ndy * actualTipLength;

	// Tip vertices
	const tipPointX = ex; const tipPointY = ey; // Tip apex is at the arrow's end point
	const tipWing1X = tipBaseCenterX + pdx * halfActualTipWidth;
	const tipWing1Y = tipBaseCenterY + pdy * halfActualTipWidth;
	const tipWing2X = tipBaseCenterX - pdx * halfActualTipWidth;
	const tipWing2Y = tipBaseCenterY - pdy * halfActualTipWidth;
	addTriangle(tipPointX, tipPointY, tipWing1X, tipWing1Y, tipWing2X, tipWing2Y);

	// Body vertices (rectangle from startCoords to tipBaseCenter)
	const bodyStartLeftX = sx + pdx * halfActualBodyWidth;
	const bodyStartLeftY = sy + pdy * halfActualBodyWidth;
	const bodyStartRightX = sx - pdx * halfActualBodyWidth;
	const bodyStartRightY = sy - pdy * halfActualBodyWidth;

	const bodyEndLeftX = tipBaseCenterX + pdx * halfActualBodyWidth;
	const bodyEndLeftY = tipBaseCenterY + pdy * halfActualBodyWidth;
	const bodyEndRightX = tipBaseCenterX - pdx * halfActualBodyWidth;
	const bodyEndRightY = tipBaseCenterY - pdy * halfActualBodyWidth;
	addQuad(bodyStartLeftX, bodyStartLeftY, bodyEndLeftX, bodyEndLeftY, bodyEndRightX, bodyEndRightY, bodyStartRightX, bodyStartRightY);

	return vertices;
}


// Exports -------------------------------------------------------------------


export default {
	update,
	stopDrawing,
	render,
};