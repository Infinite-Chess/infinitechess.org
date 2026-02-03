// src/client/scripts/esm/game/boardeditor/tools/selection/selectiontool.ts

/**
 * The Selection Tool for the Board Editor
 *
 * Acts similarly to that of Google Sheets
 */

import type { Coords } from '../../../../../../../shared/chess/util/coordutil';
import type {
	BoundingBox,
	BoundingBoxBD,
	DoubleBoundingBox,
} from '../../../../../../../shared/util/math/bounds';

import mouse from '../../../../util/mouse';
import arrows from '../../../rendering/arrows/arrows';
import stoolgraphics from './stoolgraphics';
import { Mouse } from '../../../input';
import { listener_document, listener_overlay } from '../../../chess/game';
import meshes from '../../../rendering/meshes';
import bimath from '../../../../../../../shared/util/math/bimath';
import sfill from './sfill';
import sdrag from './sdrag';
import guiboardeditor from '../../../gui/boardeditor/guiboardeditor';
import boardutil from '../../../../../../../shared/chess/util/boardutil';
import gameslot from '../../../chess/gameslot';
import boardeditor from '../../boardeditor';
import stransformations from './stransformations';

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
	if (isExistingSelection()) testShortcuts(); // Is a current selection, or one is in progress

	if (!selecting) {
		// No selection in progress (either none made yet, or have already made one)
		// Update grabbing the selection box first
		if (isACurrentSelection()) {
			sfill.update(); // Update fill tool handler
			sdrag.update(); // Update selection box drag handler
		}
		// Test if a new selection is beginning
		if (mouse.isMouseDown(Mouse.LEFT) && !selecting && !arrows.areHoveringAtleastOneArrow()) {
			// Start new selection
			mouse.claimMouseDown(Mouse.LEFT); // Remove the pointer down so other scripts don't use it
			mouse.cancelMouseClick(Mouse.LEFT); // Cancel any potential future click so other scripts don't use it
			pointerId = mouse.getMouseId(Mouse.LEFT)!;
			beginSelection();
		}
	} else {
		// Selection in progress
		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position if available
		if (respectiveListener.pointerExists(pointerId!))
			lastPointerCoords = mouse.getTilePointerOver_Integer(pointerId!)!;
		// Test if pointer released (finalize new selection)
		if (!respectiveListener.isPointerHeld(pointerId!)) endSelection();
	}
}

/** Tests for keyboard shortcuts while using the Selection Tool. */
function testShortcuts(): void {
	// Delete selection
	if (listener_document.isKeyDown('Delete') || listener_document.isKeyDown('Backspace')) {
		const gamefile = gameslot.getGamefile()!;
		const mesh = gameslot.getMesh()!;
		const selectionBox: BoundingBox = getSelectionIntBox()!;
		stransformations.Delete(gamefile, mesh, selectionBox);
	}
}

function beginSelection(): void {
	// console.log("Beginning selection");

	startPoint = undefined;
	endPoint = undefined;
	selecting = true;
	sfill.resetState();
	sdrag.resetState();

	// Set the start point
	startPoint = mouse.getTilePointerOver_Integer(pointerId!)!;
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

// function cancelSelection(): void {
// 	resetState();
// }

function resetState(): void {
	selecting = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
	startPoint = undefined;
	endPoint = undefined;
	sfill.resetState();
	sdrag.resetState();
	guiboardeditor.onClearSelection();
}

/** Whether there is a current selection, NOT whether we are currently MAKING a selection. */
function isACurrentSelection(): boolean {
	return !!startPoint && !!endPoint;
}

/**
 * Returns whether there is a current selection, or one in progress.
 * Also considered whether a selection area is renderable or not.
 */
function isExistingSelection(): boolean {
	return !!selecting || !!endPoint;
}

function render(): void {
	if (isExistingSelection()) {
		// There either is a selection, or we are currently making one
		const selectionWorldBox = getSelectionWorldBox()!;

		// Render the selection box
		stoolgraphics.renderSelectionBoxWireframe(selectionWorldBox);
		stoolgraphics.renderSelectionBoxFill(selectionWorldBox);

		if (isACurrentSelection()) {
			// Render the small square in the corner
			stoolgraphics.renderCornerSquare(selectionWorldBox);
			sfill.render(); // Fill tool graphics
			sdrag.render(); // Selection drag graphics
		}
	} else {
		// No selection, and not currently making one
		if (listener_overlay.getAllPhysicalPointers().length > 1) return; // Don't render if multiple fingers down
		// Outline the rank and file of the square hovered over
		stoolgraphics.outlineRankAndFile();
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
		top: bimath.max(startPoint[1], currentTile[1]),
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
	const roundedAwayBox: BoundingBoxBD =
		meshes.expandTileBoundingBoxToEncompassWholeSquare(intBox);
	// Convert it to a world-space box
	return meshes.applyWorldTransformationsToBoundingBox(roundedAwayBox);
}

/**
 * Returns the corners of the current selection.
 * ONLY CALL if you know a selection exists!
 */
function getSelectionCorners(): [Coords, Coords] {
	if (!startPoint || !endPoint)
		throw new Error("No current selection. Can't get selection corners.");

	return [startPoint, endPoint];
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

/** Selects all pieces in the current position, and transitions to the selection. */
function selectAll(): void {
	boardeditor.setTool('selection-tool'); // Switch if we're not already using

	const box = boardutil.getBoundingBoxOfAllPieces(gameslot.getGamefile()!.boardsim.pieces);

	if (box === undefined) {
		// No pieces, cancel selection
		resetState();
		// Disabled for now as I'm not sure I like Selecting all immediately transitioning
		// guinavigation.recenter();
		return;
	}

	startPoint = [box.left, box.top];
	endPoint = [box.right, box.bottom];

	guiboardeditor.onNewSelection();
	// Disabled for now as I'm not sure I like Selecting all immediately transitioning
	// Transition.zoomToCoordsBox(box);
}

// Exports ------------------------------------------------------

export default {
	update,
	resetState,
	isExistingSelection,
	render,
	getSelectionIntBox,
	getSelectionWorldBox,
	convertIntBoxToWorldBox,
	getSelectionCorners,
	setSelection,
	selectAll,
};
