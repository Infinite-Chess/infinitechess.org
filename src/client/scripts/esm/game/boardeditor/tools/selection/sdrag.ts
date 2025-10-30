
// src/client/scripts/esm/game/boardeditor/tools/selection/sdrag.ts

/**
 * Selection Tool Drag
 * 
 * This handles when the current selection has been grabbed on the edge,
 * and handles moving the selection.
 */

import mouse from "../../../../util/mouse";
import { Mouse } from "../../../input";
import camera from "../../../rendering/camera";
import selectiontool from "./selectiontool";


// Constants -----------------------------------------


/** The distance, in virtual screen pixels, that we may grab the edge of the selection box to drag it. */
const GRABBABLE_DIST = 16;


// State ---------------------------------------------


/** Whether the mouse is currently within the minimum distance to grab and drag the selection. */
let withinGrabDist = false;


// Methods -------------------------------------------


/**
 * Updates the logic that handles dragging the selection box from the edges.
 * ONLY CALL if there's an existing selection area, and we are not currently making a new selection!
 */
function update(): void {
	const selectionWorldBox = selectiontool.getSelectionWorldBox()!;

	// Determine the mouse world coords
	const mouseWorld = mouse.getMouseWorld(Mouse.LEFT);
	if (!mouseWorld) return;

	const distToLeftEdge = Math.abs(selectionWorldBox.left - mouseWorld[0]);
	const distToRightEdge = Math.abs(selectionWorldBox.right - mouseWorld[0]);
	const distToBottomEdge = Math.abs(selectionWorldBox.bottom - mouseWorld[1]);
	const distToTopEdge = Math.abs(selectionWorldBox.top - mouseWorld[1]);

	if (
		(distToLeftEdge <= GRABBABLE_DIST || distToRightEdge <= GRABBABLE_DIST) && 
		(distToBottomEdge <= GRABBABLE_DIST || distToTopEdge <= GRABBABLE_DIST)
	) { // Within grab distance
		if (!withinGrabDist) {
			withinGrabDist = true;
			camera.canvas.style.cursor = 'grab';
		}
	} else { // NOT within grab distance
		if (withinGrabDist) resetState();
	}
}

function resetState(): void {
	withinGrabDist = false;
	camera.canvas.style.cursor = 'default';
}


// Exports -----------------------------------------------


export default {
	update,
	resetState,
};