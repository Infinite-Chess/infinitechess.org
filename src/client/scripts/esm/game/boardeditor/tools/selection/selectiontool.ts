
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
import { BoundingBox, BoundingBoxBD, DoubleBoundingBox } from "../../../../../../../shared/util/math/bounds";
import meshes from "../../../rendering/meshes";
import bimath from "../../../../../../../shared/util/bigdecimal/bimath";
import sdrag from "./sdrag";
import guiboardeditor from "../../../gui/boardeditor/guiboardeditor";


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
		// Update grabbing the selection box first
		if (isACurrentSelection()) {
			// Update selection box drag handler
			sdrag.update();
		}
		// Test if a new selection is beginning
		if (mouse.isMouseDown(Mouse.LEFT) && !selecting && !arrows.areHoveringAtleastOneArrow()) {
			// Start new selection
			mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
			mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
			pointerId = mouse.getMouseId(Mouse.LEFT)!;
			beginSelection();
		}
	} else { // Selection in progress
		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position if available
		if (respectiveListener.pointerExists(pointerId!)) lastPointerCoords = getPointerCoords(pointerId!);
		// Test if pointer released (finalize new selection)
		if (!respectiveListener.isPointerHeld(pointerId!)) endSelection();
	}
}

/**
 * Gets the given pointer's current coordinates being hovered over, rounded to the integer square.
 * ONLY CALL if you know the pointer exists!
 */
function getPointerCoords(pointerId: string): Coords {
	const pointerWorld = mouse.getPointerWorld(pointerId)!;
	return space.convertWorldSpaceToCoords_Rounded(pointerWorld);
}

function beginSelection(): void {
	// console.log("Beginning selection");

	startPoint = undefined;
	endPoint = undefined;
	selecting = true;
	sdrag.resetState();

	// Set the start point
	startPoint = getPointerCoords(pointerId!);
	lastPointerCoords = startPoint;
}

function endSelection(): void {
	// console.error("Ending selection");

	// Set the end point
	endPoint = lastPointerCoords;
	guiboardeditor.onNewSelection();

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
	sdrag.resetState();
	guiboardeditor.onClearSelection();
}


/** Whether there is a current selection, NOT whether we are currently MAKING a selection. */
function isACurrentSelection(): boolean {
	return !!startPoint && !!endPoint;
}



function render(): void {
	if (!selecting && !endPoint) { // No selection, and not currently making one
		if (listener_overlay.getAllPhysicalPointers().length > 1) return; // Don't render if multiple fingers down
		// Outline the rank and file of the square hovered over
		stoolgraphics.outlineRankAndFile(); 
	} else { // There either is a selection, or we are currently making one

		const selectionWorldBox = getSelectionWorldBox()!;

		// Render the selection box
		stoolgraphics.renderSelectionBoxWireframe(selectionWorldBox);
		stoolgraphics.renderSelectionBoxFill(selectionWorldBox);

		if (isACurrentSelection()) {
			// Render the small square in the corner
			stoolgraphics.renderCornerSquare(selectionWorldBox);
			sdrag.render();
		}
	}
}

/** Returns the integer coordinate bounding box of our selection area. */
function getSelectionIntBox(): BoundingBox | undefined {
	const currentTile: Coords | undefined = endPoint || lastPointerCoords;
	if (!startPoint || !currentTile) return;

	return {
		left: bimath.min(startPoint[0], currentTile[0]),
		right: bimath.max(startPoint[0], currentTile[0]),
		bottom: bimath.min(startPoint[1], currentTile[1]),
		top: bimath.max(startPoint[1], currentTile[1])
	};
}

/** Calculates the world space edge coordinates of the current selection box. */
function getSelectionWorldBox(): DoubleBoundingBox | undefined {
	const intBox = getSelectionIntBox();
	if (!intBox) return;

	return convertIntBoxToWorldBox(intBox);
}

/**
 * Converts an int selection box to a world-space box, rounding away
 * its edges outward to encapsulate the entirity of the squares.
 */
function convertIntBoxToWorldBox(intBox: BoundingBox): DoubleBoundingBox {
	// Moves the edges of the box outward to encapsulate the entirity of the squares, instead of just the centers.
	const roundedAwayBox: BoundingBoxBD = meshes.expandTileBoundingBoxToEncompassWholeSquare(intBox);
	// Convert it to a world-space box
	return meshes.applyWorldTransformationsToBoundingBox(roundedAwayBox);
}

/**
 * Returns the corners of the current selection.
 * ONLY CALL if you know a selection exists!
 */
function getSelectionCorners(): [Coords, Coords] {
	if (!startPoint || !endPoint) throw new Error("No current selection. Can't get selection corners.");

	return [
		startPoint,
		endPoint,
	];
}

/**
 * Sets the current selected area.
 * ONLY CALL if this is an overwriting of the existing
 * selection, NOT to set it when it does not have a value!
 */
function setSelection(corner1: Coords, corner2: Coords): void {
	if (!startPoint || !endPoint) throw new Error("No current selection. Can't set selection.");

	startPoint = corner1;
	endPoint = corner2;
}


// Exports ------------------------------------------------------


export default {
	update,
	getPointerCoords,
	resetState,
	render,
	getSelectionIntBox,
	getSelectionWorldBox,
	convertIntBoxToWorldBox,
	getSelectionCorners,
	setSelection,
};