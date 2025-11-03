
// src/client/scripts/esm/game/boardeditor/tools/selection/sfill.ts

/**
 * Selection Tool Fill
 * 
 * This handles the fill operation when dragging the fill handle
 * on the bottom-right corner of the selection box.
 */

import type { Coords, DoubleCoords } from "../../../../../../../shared/chess/util/coordutil";

import { Mouse } from "../../../input";
import bounds, { BoundingBox, DoubleBoundingBox } from "../../../../../../../shared/util/math/bounds";
import bimath from "../../../../../../../shared/util/bigdecimal/bimath";
import mouse from "../../../../util/mouse";
import gameslot from "../../../chess/gameslot";
import space from "../../../misc/space";
import arrows from "../../../rendering/arrows/arrows";
import selectiontool from "./selectiontool";
import stoolgraphics from "./stoolgraphics";
import stransformations from "./stransformations";
import vectors from "../../../../../../../shared/util/math/vectors";
import sdrag from "./sdrag";
import scursor from "./scursor";


// State ---------------------------------------------


/** Whether the mouse is currently within the minimum distance to grab the fill handle. */
let withinGrabDist = false;

/** Whether we are currently dragging the selection. */
let areFilling = false;
/** The ID of the pointer currently being used drag the selection. */
let pointerId: string | undefined = undefined;
/** The last known square the pointer was hovering over. */
let lastPointerCoords: Coords | undefined;


// Methods -------------------------------------------


/** Returns whether we are currently filling. */
function areWeFilling(): boolean {
	return areFilling;
}

/**
 * Updates the logic that handles dragging the selection box from the edges.
 * ONLY CALL if there's an existing selection area, and we are not currently making a new selection!
 */
function update(): void {
	if (areFilling) {
		// Determine if the selection has been dropped

		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position if available
		if (respectiveListener.pointerExists(pointerId!)) lastPointerCoords = selectiontool.getPointerCoords(pointerId!);
		// Test if pointer released (execute selection translation)
		if (!respectiveListener.isPointerHeld(pointerId!)) executeFill();
	} else {
		// Determine if the fill handle needs to be grabbed,
		// or if the canvas cursor style should change.
		if (isMouseHoveringOverFillHandle()) { // Within grab distance
			if (!withinGrabDist) {
				withinGrabDist = true;
				scursor.addCursor('crosshair');
			}

			// Determine if we started dragging the fill handle
			if (mouse.isMouseDown(Mouse.LEFT) && !arrows.areHoveringAtleastOneArrow()) {
				// Start dragging
				mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
				mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
				pointerId = mouse.getMouseId(Mouse.LEFT)!;
				startFill();
			}
		} else { // NOT within grab distance
			if (withinGrabDist) {
				withinGrabDist = false;
				scursor.removeCursor('crosshair');
			}
		}
	}
}

/** Calculates whether the mouse is currently hovering within grab distance of the fill handle. */
function isMouseHoveringOverFillHandle(): boolean {
	const selectionWorldBox = selectiontool.getSelectionWorldBox()!;
	const fillHandleCorner: DoubleCoords = [ // Bottom-right corner
		selectionWorldBox.right,
		selectionWorldBox.bottom,
	];

	// Determine the mouse world coords
	const mouseWorld = mouse.getMouseWorld(Mouse.LEFT);
	if (!mouseWorld) return false;

	// Convert grab distance to world space
	const grabbableDist = space.convertPixelsToWorldSpace_Virtual(sdrag.GRABBABLE_DIST);

	// Determine the distance from the mouse to the fill handle corner
	const distToFillHandle = vectors.chebyshevDistanceDoubles(mouseWorld, fillHandleCorner);

	// Return whether it's within grab distance
	return distToFillHandle <= grabbableDist;
}

function resetState(): void {
	withinGrabDist = false;
	scursor.removeCursor('crosshair');
	areFilling = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
}

/** Grabs the selection box. */
function startFill(): void {
	areFilling = true;

	lastPointerCoords = selectiontool.getPointerCoords(pointerId!);
}

function executeFill(): void {
	const fillState = calculateFillState();

	// Reset state AFTER calculating fill amount
	resetState();

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	stransformations.Fill(gamefile, mesh, selectionBox, fillState.axis!, fillState.fillDistance!);
}

/**
 * Determines the fill axis and distance based on the current pointer position.
 */
function calculateFillState(): { axis: 0 | 1; fillDistance: bigint } | undefined {
	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;

	// If the pointer is contained within the selection box, skip
	if (bounds.boxContainsSquare(selectionBox, lastPointerCoords!)) return;

	const distXFromLeft = lastPointerCoords![0] - selectionBox.left;
	const distXFromRight = lastPointerCoords![0] - selectionBox.right;
	const distYFromBottom = lastPointerCoords![1] - selectionBox.bottom;
	const distYFromTop = lastPointerCoords![1] - selectionBox.top;

	const distXChoice = distXFromRight > 0n ? distXFromRight : distXFromLeft < 0n ? distXFromLeft : 0n;
	const distYChoice = distYFromTop > 0n ? distYFromTop : distYFromBottom < 0n ? distYFromBottom : 0n;

	// Determine which axis has the larger distance from the selection box
	if (bimath.abs(distXChoice) >= bimath.abs(distYChoice)) {
		// X axis
		return {
			axis: 0,
			fillDistance: distXChoice,
		};
	} else {
		// Y axis
		return {
			axis: 1,
			fillDistance: distYChoice,
		};
	}
}


// Rendering ---------------------------------------------


function render(): void {
	if (!areFilling) return;
	
	const fillState = calculateFillState();
	if (!fillState) return; // No fill to perform (let go within selection box)

	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;

	// Determine the fill int box to render depending on the state
	let fillBox: BoundingBox;
	if (fillState.axis === 0) { // X axis

		if (fillState.fillDistance > 0n) { // Filling to the right
			fillBox = {
				left: selectionBox.right + 1n,
				right: selectionBox.right + fillState.fillDistance,
				bottom: selectionBox.bottom,
				top: selectionBox.top,
			};
		} else { // Filling to the left
			fillBox = {
				left: selectionBox.left + fillState.fillDistance,
				right: selectionBox.left - 1n,
				bottom: selectionBox.bottom,
				top: selectionBox.top,
			};
		}
	} else { // Y axis
		if (fillState.fillDistance > 0n) { // Filling upwards
			fillBox = {
				left: selectionBox.left,
				right: selectionBox.right,
				bottom: selectionBox.top + 1n,
				top: selectionBox.top + fillState.fillDistance,
			};
		} else { // Filling downwards
			fillBox = {
				left: selectionBox.left,
				right: selectionBox.right,
				bottom: selectionBox.bottom + fillState.fillDistance,
				top: selectionBox.bottom - 1n,
			};
		}
	}

	// Convert it to a world-space box, with edges rounded away to encapsulate the entirity of the squares.
	const translatedWorldBox: DoubleBoundingBox = selectiontool.convertIntBoxToWorldBox(fillBox);

	// TODO: Make this a dashed outline box
	stoolgraphics.renderSelectionBoxWireframe(translatedWorldBox);
	// stoolgraphics.renderSelectionBoxFill(translatedWorldBox);
}


// Exports -----------------------------------------------


export default {
	areWeFilling,
	update,
	resetState,
	render,
};