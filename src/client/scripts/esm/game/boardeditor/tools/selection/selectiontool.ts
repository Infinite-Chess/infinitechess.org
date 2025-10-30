
// src/client/scripts/esm/game/boardeditor/tools/selection.ts

/**
 * The Selection Tool for the Board Editor
 * 
 * Acts similarly to that of Google Sheets
 */

import type { Coords } from "../../../../../../../shared/chess/util/coordutil";

import mouse from "../../../../util/mouse";
import arrows from "../../../rendering/arrows/arrows";
import stoolgraphics from "./stoolgraphics";
import space from "../../../misc/space";
import { Mouse } from "../../../input";
import { listener_overlay } from "../../../chess/game";


// State ----------------------------------------------


/** Whether or now we are currently making a selection. */
let selecting: boolean = false;
/** The ID of the pointer currently being used creating a selection. */
let pointerId: string | undefined = undefined;
/** The last known square the pointer was hovering over. */
let lastPointerCoords: Coords | undefined;

/** The square that the selection began at. */
let startPoint: Coords | undefined;
/**
 * The square that the selection ends at.
 * ONLY DEFINED when we have an actual selection made already,
 * NOT when we are currently MAKING a selection.
 */
let endPoint: Coords | undefined;


// Methods -------------------------------------------


function update(): void {
	if (!selecting) { // No selection in progress (either none made yet, or have already made one)
		// Test if a new selection is beginning
		if (mouse.isMouseDown(Mouse.LEFT) && !selecting && !arrows.areHoveringAtleastOneArrow()) {
			mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
			mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
			pointerId = mouse.getMouseId(Mouse.LEFT)!;
			beginSelection();
		}
	} else { // Selection in progress
		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position if available
		if (respectiveListener.pointerExists(pointerId!)) lastPointerCoords = getPointerCoords();
		// Test if pointer released (finalize new selection)
		if (!respectiveListener.isPointerHeld(pointerId!)) endSelection();
	}
}

/**
 * Gets the pointer's current coordinates being hovered over.
 * ONLY CALL if you know the pointer exists!
 */
function getPointerCoords(): Coords {
	const pointerWorld = mouse.getPointerWorld(pointerId!)!;
	return space.convertWorldSpaceToCoords_Rounded(pointerWorld);
}

function beginSelection(): void {
	// console.log("Beginning selection");

	startPoint = undefined;
	endPoint = undefined;
	selecting = true;

	// Set the start point
	startPoint = getPointerCoords();
	lastPointerCoords = startPoint;
}

function endSelection(): void {
	// console.error("Ending selection");

	// Set the end point
	endPoint = lastPointerCoords;

	selecting = false;
	pointerId = undefined;
}

function cancelSelection(): void {
	resetState();
}

function resetState(): void {
	selecting = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
	startPoint = undefined;
	endPoint = undefined;
}


/** Whether there is a current selection, NOT whether we are currently MAKING a selection. */
function isACurrentSelection(): boolean {
	return !!startPoint && !!endPoint;
}



function render(): void {
	// When there's no selection, outline the rank and file of the square hovered over
	if (!selecting && !endPoint) {
		if (listener_overlay.getAllPhysicalPointers().length > 1) return; // Don't render if multiple fingers down
		stoolgraphics.outlineRankAndFile(); 
	} else { // There either is a selection, or we are currently making one
		// Render the selection box...
		const currentTile: Coords | undefined = endPoint || lastPointerCoords;
		if (!startPoint || !currentTile) return;
		stoolgraphics.renderSelectionBox(startPoint, currentTile);
	}
}



export default {
	update,
	resetState,
	render,
};