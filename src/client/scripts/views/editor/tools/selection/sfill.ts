// src/client/scripts/views/editor/tools/selection/sfill.ts

/**
 * Selection Tool Fill
 *
 * This handles the fill operation when dragging the fill handle
 * on the bottom-right corner of the selection box.
 */

import type { Coords, DoubleCoords } from '../../../../../../shared/util/coordutil.js';

import bimath from '../../../../../../shared/util/math/bimath.js';
import vectors from '../../../../../../shared/util/math/vectors.js';
import bounds, {
	BoundingBox,
	DoubleBoundingBox,
} from '../../../../../../shared/util/math/bounds.js';

import mouse from '../../../../game/mouse.js';
import space from '../../../../board/rendering/space.js';
import sdrag from './sdrag.js';
import camera from '../../../../board/rendering/camera.js';
import scursor from './scursor.js';
import gameslot from '../../../../game/chess/gameslot.js';
import { MOUSE } from '../../../../game/input.js';
import selectiontool from './selectiontool.js';
import stoolgraphics from './stoolgraphics.js';
import stransformations from './stransformations.js';
import arrowinteraction from '../../../../game/rendering/arrows/arrowinteraction.js';

// State -----------------------------------------------------------------------

/** Whether the mouse is currently within the minimum distance to grab the fill handle. */
let withinGrabDist = false;

/** Whether we are currently dragging the fill handle. */
let areFilling = false;
/** The ID of the pointer currently dragging the fill handle. */
let pointerId: string | undefined = undefined;
/** The last known square the pointer was hovering over. */
let lastPointerCoords: Coords | undefined;

// Methods ---------------------------------------------------------------------

/**
 * Updates the logic that handles dragging the fill handle.
 * ONLY CALL if there's an existing selection area, and we are not currently making a new selection!
 */
function update(): void {
	if (areFilling) {
		// Determine if the selection has been dropped

		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position while held, else execute the fill
		if (respectiveListener.isPointerHeld(pointerId!))
			lastPointerCoords = mouse.getTilePointerOver_Integer(pointerId!)!;
		else executeFill();
	} else {
		// Determine if the fill handle needs to be grabbed,
		// or if the canvas cursor style should change.
		if (isMouseHoveringOverFillHandle()) {
			// Within grab distance
			if (!withinGrabDist) {
				withinGrabDist = true;
				scursor.addCursor('crosshair');
			}

			// Determine if we started dragging the fill handle
			if (mouse.isMouseDown(MOUSE.LEFT) && !arrowinteraction.areHoveringAtleastOneArrow()) {
				// Start dragging
				mouse.claimMouseDown(MOUSE.LEFT); // Remove the pointer down so other scripts don't use it
				mouse.cancelMouseClick(MOUSE.LEFT); // Cancel any potential future click so other scripts don't use it
				pointerId = mouse.getMouseId(MOUSE.LEFT)!;
				startFill();
			}
		} else {
			// NOT within grab distance
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
	const fillHandleCorner: DoubleCoords = [
		// Bottom-right corner
		selectionWorldBox.right,
		selectionWorldBox.bottom,
	];

	// Determine the mouse world coords
	const mouseWorld = mouse.getMouseWorld(MOUSE.LEFT);
	if (!mouseWorld) return false;

	// Convert grab distance to world space
	const grabbableDist = space.convertPixelsToWorldSpace_Virtual(camera, sdrag.getGrabbableDist());

	// Determine the distance from the mouse to the fill handle corner
	const distToFillHandle = vectors.chebyshevDistanceDoubles(mouseWorld, fillHandleCorner);

	// Return whether it's within grab distance
	return distToFillHandle <= grabbableDist;
}

/** Drops any fill in progress and its cursor style. */
function resetState(): void {
	withinGrabDist = false;
	scursor.removeCursor('crosshair');
	areFilling = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
}

/** Grabs the fill handle. */
function startFill(): void {
	areFilling = true;

	lastPointerCoords = mouse.getTilePointerOver_Integer(pointerId!)!;
}

/** Releases the fill handle, repeating the selection into the dragged-out box. */
function executeFill(): void {
	const fillBox = calculateFillBox();

	// Reset state AFTER calculating fill box
	resetState();

	if (!fillBox) return; // No fill to perform (let go within selection box)

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	stransformations.Fill(gamefile, mesh, selectionBox, fillBox);
}

/** Determines the fill axis and distance based on the current pointer position. */
function calculateFillBox(): BoundingBox | undefined {
	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;

	// If the pointer is contained within the selection box, skip
	if (bounds.boxContainsSquare(selectionBox, lastPointerCoords!)) return;

	const distXFromLeft = lastPointerCoords![0] - selectionBox.left;
	const distXFromRight = lastPointerCoords![0] - selectionBox.right;
	const distYFromBottom = lastPointerCoords![1] - selectionBox.bottom;
	const distYFromTop = lastPointerCoords![1] - selectionBox.top;

	const distXChoice =
		distXFromRight > 0n ? distXFromRight : distXFromLeft < 0n ? distXFromLeft : 0n;
	const distYChoice =
		distYFromTop > 0n ? distYFromTop : distYFromBottom < 0n ? distYFromBottom : 0n;

	// Determine which axis has the larger distance from the selection box
	if (bimath.abs(distXChoice) >= bimath.abs(distYChoice)) {
		// X Axis
		if (distXChoice > 0n) {
			// Filling to the right
			return {
				left: selectionBox.right + 1n,
				right: lastPointerCoords![0],
				bottom: selectionBox.bottom,
				top: selectionBox.top,
			};
		} else {
			// Filling to the left
			return {
				left: lastPointerCoords![0],
				right: selectionBox.left - 1n,
				bottom: selectionBox.bottom,
				top: selectionBox.top,
			};
		}
	} else {
		// Y axis
		if (distYChoice > 0n) {
			// Filling upwards
			return {
				left: selectionBox.left,
				right: selectionBox.right,
				bottom: selectionBox.top + 1n,
				top: lastPointerCoords![1],
			};
		} else {
			// Filling downwards
			return {
				left: selectionBox.left,
				right: selectionBox.right,
				bottom: lastPointerCoords![1],
				top: selectionBox.bottom - 1n,
			};
		}
	}
}

// Rendering -------------------------------------------------------------------

/** Outlines the box the fill would cover if released now. */
function render(): void {
	if (!areFilling) return;

	// Determine the fill int box to render depending on the state
	const fillBox = calculateFillBox();
	if (!fillBox) return; // No fill to perform (let go within selection box)

	// Convert it to a world-space box, with edges rounded away to encapsulate the entirity of the squares.
	const worldFillBox: DoubleBoundingBox = selectiontool.convertIntBoxToWorldBox(fillBox);

	stoolgraphics.renderSelectionBoxWireframeDashed(worldFillBox);
}

// Exports ---------------------------------------------------------------------

export default {
	update,
	resetState,
	render,
};
