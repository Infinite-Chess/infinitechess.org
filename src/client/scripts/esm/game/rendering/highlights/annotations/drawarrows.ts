
/**
 * This script allows the user to draw arrows on the board.
 * 
 * Helpful for analysis, and requested by many.
 */


import space from "../../../misc/space";
// @ts-ignore
import input from "../../../input";


import type { Arrow } from "./annotations";
import type { Coords } from "../../../../chess/util/coordutil";
import math, { Color } from "../../../../util/math";
import movement from "../../movement";
import preferences from "../../../../components/header/preferences";
import { createModel } from "../../buffermodel";


// Variables -----------------------------------------------------------------


/** Properties for the drawn arrows.*/
const ARROW = {
	/** Width of the arrow's rectangular body, where 1.0 spans a full square. */
	BODY_WIDTH: 0.2,
	/** Width of the base of the arrowhead (perpendicular to arrow direction), where 1.0 spans a full square. */
	TIP_WIDTH: 0.45,
	/** Length of the arrowhead (along arrow direction), where 1.0 spans a full square. */
	TIP_LENGTH: 0.4,
	/**
	 * The minimum desired length of the arrow's body, as a proportion of the total arrow length.
	 * E.g., 0.5 means the body should try to be at least 50% of the total arrow length.
	 * If the arrow is too short for both this proportional body and the ARROW.TIP_LENGTH,
	 * both body and tip lengths will be adjusted.
	 * Valid range: [0.0, 1.0]. 0.0 means no minimum proportional body length is enforced beyond
	 * what's left after the tip takes ARROW.TIP_LENGTH. 1.0 means the arrow tries to be all body.
	 */
	MIN_BODY_PROPORTION: 0.3 // Example: Body should be at least 30% of total arrow length
};

/**
 * If an arrow has both a body and a tip, this is the minimum length
 * the body part should ideally have. If the total arrow length is too short
 * to accommodate this and the desired tip length, both body and tip
 * will be scaled down proportionally.
 * Set to 0 if you don't want a minimum body length consideration
 * (body will just be total_length - desired_tip_length, or 0 if that's negative).
 * This value is in world space units.
 */
const MIN_ARROW_BODY_LENGTH_THRESHOLD = 0.05; // Example: 5% of a square width

/** Values smaller than this are considered zero for drawing. */
const ARROW_DRAW_THRESHOLD = 0.04; // Default: 0.001 




/** This will be defined if we are CURRENTLY drawing an arrow. */
let drag_start: Coords | undefined;


// Updating -----------------------------------------------------------------


/**
 * Tests if the user has added any new square highlights,
 * or deleted any existing ones.
 * REQUIRES THE HOVERED HIGHLIGHTS to be updated prior to calling this!
 * @param highlights - All square highlights currently on the board.
 */
function update(arrows: Arrow[]) {

	if (!drag_start) {
		// Test if right mouse down (start drawing)
		if (input.isMouseDown_Right()) {
			const pointerWorld = input.getPointerWorldLocation() as Coords;
			drag_start = space.convertWorldSpaceToCoords(pointerWorld);
			console.log('drag_start:', drag_start);
		}
	} else { // Currently drawing an arrow
		// Test if mouse released (finalize arrow)
		if (!input.isMouseDown_Right()) {
			addDrawnArrow(arrows);
			drag_start = undefined; // Reset drawing
		}
	}
}

/**
 * Adds the currently drawn arrow to the list.
 * @param arrows - All arrows currently visible on the board.
 */
function addDrawnArrow(arrows: Arrow[]) {
	const pointerWorld = input.getPointerWorldLocation() as Coords;
	const drag_end = space.convertWorldSpaceToCoords_Rounded(pointerWorld);
	// Add the arrow
	arrows.push({ start: drag_start!, end: drag_end });
}

function stopDrawing() {
	drag_start = undefined;
}


// Rendering -----------------------------------------------------------------



function render(arrows: Arrow[]) {
	// Add the arrow currently being drawn
	if (drag_start) addDrawnArrow(arrows);

	// Construct the data
	const color = preferences.getAnnoteArrowColor();
	const data: number[] = [];
	for (const arrow of arrows) {
		const startWorld = space.convertCoordToWorldSpace(arrow.start);
		const endWorld = space.convertCoordToWorldSpace(arrow.end);
		data.push(...getDataArrow(startWorld, endWorld, color));
	}

	createModel(data, 2, 'TRIANGLES', true).render(); // No transform needed

	// Remove the arrow currently being drawn
	if (drag_start) arrows.pop();
}


/**
 * Generates vertex data for a single arrow.
 * @param startWorld - The starting coordinates [x, y] of the arrow's base (world space).
 * @param endWorld - The ending coordinates [x, y] of the arrow's tip (world space).
 * @param color - The color [r, g, b, a] of the arrow.
 * @returns The vertex data for the arrow (x,y, r,g,b,a).
 */
function getDataArrow(
    startWorld: Coords,
    endWorld: Coords,
    color: Color
): number[] {
    const [r, g, b, a] = color;
    const vertices: number[] = [];

	const boardScale = movement.getBoardScale();

    const bodyWidthArg = ARROW.BODY_WIDTH * boardScale;
    const tipWidthArg = ARROW.TIP_WIDTH * boardScale;
    const desiredTipLength = ARROW.TIP_LENGTH * boardScale;

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

    // if (length < ARROW_DRAW_THRESHOLD) return []; // Arrow is too tiny to be visible.

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