
// src/client/scripts/esm/game/boardeditor/tools/selection/sdrag.ts

/**
 * Selection Tool Drag
 * 
 * This handles when the current selection has been grabbed on the edge,
 * and handles moving the selection.
 */

import { Mouse } from "../../../input";
import coordutil, { Coords, DoubleCoords } from "../../../../../../../shared/chess/util/coordutil";
import bimath from "../../../../../../../shared/util/bigdecimal/bimath";
import bounds, { BoundingBox, DoubleBoundingBox } from "../../../../../../../shared/util/math/bounds";
import mouse from "../../../../util/mouse";
import game from "../../../chess/game";
import gameslot from "../../../chess/gameslot";
import space from "../../../misc/space";
import arrows from "../../../rendering/arrows/arrows";
import selectiontool from "./selectiontool";
import stoolgraphics from "./stoolgraphics";
import stransformations from "./stransformations";


// Constants -----------------------------------------


/** The distance, in virtual screen pixels, that we may grab the edge of the selection box to drag it. */
const GRABBABLE_DIST = 6;


// State ---------------------------------------------


/** Whether the mouse is currently within the minimum distance to grab and drag the selection. */
let withinGrabDist = false;

/** Whether we are currently dragging the selection. */
let areDragging = false;
/** The ID of the pointer currently being used drag the selection. */
let pointerId: string | undefined = undefined;
/** The last known square the pointer was hovering over. */
let lastPointerCoords: Coords | undefined;
/** The integer coordinate the mouse has grabbed, if we're dragging the selection. */
let anchorCoords: Coords | undefined = undefined;


// Methods -------------------------------------------


/**
 * Updates the logic that handles dragging the selection box from the edges.
 * ONLY CALL if there's an existing selection area, and we are not currently making a new selection!
 */
function update(): void {
	if (areDragging) {
		// Determine if the selection has been dropped

		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position if available
		if (respectiveListener.pointerExists(pointerId!)) lastPointerCoords = selectiontool.getPointerCoords(pointerId!);
		// Test if pointer released (execute selection translation)
		if (!respectiveListener.isPointerHeld(pointerId!)) dropSelection();
	} else {
		// Determine if the board needs to be picked up,
		// or if the canvas cursor style should change.
		if (isMouseHoveringOverSelectionEdge()) { // Within grab distance
			if (!withinGrabDist) {
				withinGrabDist = true;
				game.getOverlay().style.cursor = 'grab';
			}

			// Determine if we picked up the selection
			if (mouse.isMouseDown(Mouse.LEFT) && !arrows.areHoveringAtleastOneArrow()) {
				// Start dragging
				mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
				mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
				pointerId = mouse.getMouseId(Mouse.LEFT)!;
				pickUpSelection();
			}
		} else { // NOT within grab distance
			if (withinGrabDist) {
				withinGrabDist = false;
				game.getOverlay().style.cursor = 'default';
			}
		}
	}
}

/** Calculates whether the mouse is currently hovering within grab distance of the selection edge. */
function isMouseHoveringOverSelectionEdge(): boolean {
	const selectionWorldBox = selectiontool.getSelectionWorldBox()!;

	// Determine the mouse world coords
	const mouseWorld = mouse.getMouseWorld(Mouse.LEFT);
	if (!mouseWorld) return false;

	// Convert grab distance to world space
	const grabbableDist = space.convertPixelsToWorldSpace_Virtual(GRABBABLE_DIST);

	// Determine if the mouse is within the grabbable edge area.
	// This is true if the mouse is inside the selection box expanded by the grab distance,
	// but not inside the selection box shrunk by the grab distance.
	const mouseIsInOuterBox = (
		mouseWorld[0] >= selectionWorldBox.left - grabbableDist &&
		mouseWorld[0] <= selectionWorldBox.right + grabbableDist &&
		mouseWorld[1] >= selectionWorldBox.bottom - grabbableDist &&
		mouseWorld[1] <= selectionWorldBox.top + grabbableDist
	);
	const mouseIsInInnerBox = (
		mouseWorld[0] > selectionWorldBox.left + grabbableDist &&
		mouseWorld[0] < selectionWorldBox.right - grabbableDist &&
		mouseWorld[1] > selectionWorldBox.bottom + grabbableDist &&
		mouseWorld[1] < selectionWorldBox.top - grabbableDist
	);

	return mouseIsInOuterBox && !mouseIsInInnerBox;
}

function resetState(): void {
	withinGrabDist = false;
	game.getOverlay().style.cursor = 'default';
	areDragging = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
	anchorCoords = undefined;
}

/** Grabs the selection box. */
function pickUpSelection(): void {
	areDragging = true;
	game.getOverlay().style.cursor = 'grabbing';

	// Determine the nearest coordinate of the selection the mouse picked up.
	// This will be the anchor

	const selectionIntBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	const pointerCoordRounded: Coords = getIntCoordOfPointer();

	// Clamp the pointer coord to the int box
	anchorCoords = [
		bimath.clamp(pointerCoordRounded[0], selectionIntBox.left, selectionIntBox.right),
		bimath.clamp(pointerCoordRounded[1], selectionIntBox.bottom, selectionIntBox.top),
	];
	lastPointerCoords = anchorCoords;
}

function dropSelection(): void {
	// Determine the final distance to translate the selection.
	
	// Determine by how many tiles the pointer has dragged from the anchor
	const translation: Coords = coordutil.subtractCoords(lastPointerCoords!, anchorCoords!);

	// Reset state AFTER getting total translation
	resetState();

	// If the translation is zero, skip the transformation
	if (translation[0] === 0n && translation[1] === 0n) return;

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	stransformations.Translate(gamefile, mesh, selectionBox, translation);
}

/**
 * Returns the integer-rounded coordinate the pointer is currently over.
 * ONLY CALL if you are sure the pointer exists!
 */
function getIntCoordOfPointer(): Coords {
	const pointerWorld: DoubleCoords = mouse.getPointerWorld(pointerId!)!;
	return space.convertWorldSpaceToCoords_Rounded(pointerWorld);
}

// /**
//  * Whether we are currently dragging the selection, AND
//  * we have dragged it atleast 1 square away from the anchor.
//  */
// function isDragTranslationPositive(): boolean {
// 	if (!areDragging || !anchorCoords) return false;

// 	// Determine the current int coord of the pointer
// 	const pointerCoordRounded: Coords = getIntCoordOfPointer();
// 	// Determine by how many tiles the pointer has dragged from the anchor
// 	const translation: Coords = coordutil.subtractCoords(pointerCoordRounded, anchorCoords!);

// 	// Return whether that's absolutely positive
// 	return translation[0] !== 0n || translation[1] !== 0n;
// }


// Rendering ---------------------------------------------


function render(): void {
	if (!areDragging || !anchorCoords) return;

	// Determine the current int coord of the pointer
	const pointerCoordRounded: Coords = getIntCoordOfPointer();

	// Determine by how many tiles the pointer has dragged from the anchor
	const translation: Coords = coordutil.subtractCoords(pointerCoordRounded, anchorCoords);

	// If the translation is zero, skip
	if (translation[0] === 0n && translation[1] === 0n) return;

	const selectionIntBox: BoundingBox = selectiontool.getSelectionIntBox()!;
	// Transform the selection box so we can show graphically where it will be moved to, if let go now.
	const translatedIntBox: BoundingBox = bounds.translateBoundingBox(selectionIntBox, translation);

	// Convert it to a world-space box, with edges rounded away to encapsulate the entirity of the squares.
	const translatedWorldBox: DoubleBoundingBox = selectiontool.convertIntBoxToWorldBox(translatedIntBox);

	stoolgraphics.renderSelectionBoxWireframe(translatedWorldBox);
	// stoolgraphics.renderSelectionBoxFill(translatedWorldBox);
}


// Exports -----------------------------------------------


export default {
	GRABBABLE_DIST,
	update,
	resetState,
	render,
};