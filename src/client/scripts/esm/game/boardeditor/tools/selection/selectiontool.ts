
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
import { Mouse } from "../../../input";


// State ----------------------------------------------


/** Whether or now we are currently making a selection. */
let selecting: boolean = false;
/** The ID of the pointer currently being used creating a selection. */
let pointerId: string | undefined = undefined;

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
	if (mouse.isMouseDown(Mouse.LEFT) && !selecting && !arrows.areHoveringAtleastOneArrow()) {
		mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
		mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
		pointerId = mouse.getMouseId(Mouse.LEFT)!;
		beginSelection();
	}
	else if (!mouse.isMouseHeld(Mouse.LEFT) && selecting) return endSelection();
}

function beginSelection(): void {
	resetState(); // Erase previous selection state
	selecting = true;

	// Determine what square the mouse is hovering over
	const currentTile: Coords | undefined = mouse.getTileMouseOver_Integer();
	if (!currentTile) return;
	
	// Set the start point
	startPoint = currentTile;
}

function endSelection(): void {
	// Determine what square the mouse is hovering over
	const endTile: Coords | undefined = mouse.getTileMouseOver_Integer();
	if (!endTile) {
		// Not sure why this would ever happen but let's be safe I guess?
		resetState();
		return;
	}

	// Set the end point
	endPoint = endTile;

	console.log("Selection made from ", startPoint, " to ", endPoint, "!");

	selecting = false;
	pointerId = undefined;
}

function cancelSelection(): void {
	resetState();
}

function resetState(): void {
	selecting = false;
	pointerId = undefined;
	startPoint = undefined;
	endPoint = undefined;
}

/** If the given pointer is currently being for making a selection, this stops using it. */
function stealPointer(pointerIdToSteal: string): void {
	if (pointerId !== pointerIdToSteal) return; // Not the pointer drawing the edit, don't stop using it.
	cancelSelection();
}


/** Whether there is a current selection, NOT whether we are currently MAKING a selection. */
function isACurrentSelection(): boolean {
	return !!startPoint && !!endPoint;
}



function render(): void {
	// When there's no selection, outline the rank and file of the square hovered over
	if (!selecting && !endPoint) stoolgraphics.outlineRankAndFile();

	// Render the selection box
	const currentTile: Coords | undefined = endPoint || mouse.getTileMouseOver_Integer();
	if (!startPoint || !currentTile) return;

	stoolgraphics.renderSelectionBox(startPoint, currentTile);
}



export default {
	update,
	resetState,
	stealPointer,
	render,
};