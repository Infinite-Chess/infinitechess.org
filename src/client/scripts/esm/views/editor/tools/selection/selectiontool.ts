// src/client/scripts/esm/views/editor/tools/selection/selectiontool.ts

/**
 * The Selection Tool for the Board Editor
 *
 * Acts similarly to that of Google Sheets
 */

import type { Coords } from '../../../../../../../shared/util/coordutil.js';
import type {
	BoundingBox,
	BoundingBoxBD,
	DoubleBoundingBox,
} from '../../../../../../../shared/util/math/bounds.js';

import bimath from '../../../../../../../shared/util/math/bimath.js';
import boardutil from '../../../../../../../shared/chess/logic/boardutil.js';

import mouse from '../../../../game/mouse.js';
import sfill from './sfill.js';
import sdrag from './sdrag.js';
import meshes from '../../../../board/rendering/meshes.js';
import gameslot from '../../../../game/chess/gameslot.js';
import boardpos from '../../../../board/rendering/boardpos.js';
import { MOUSE } from '../../../../game/input.js';
import { GameBus } from '../../../../board/GameBus.js';
import etoolmanager from '../etoolmanager.js';
import stoolgraphics from './stoolgraphics.js';
import stransformations from './stransformations.js';
import arrowinteraction from '../../../../game/rendering/arrows/arrowinteraction.js';
import guipositionheader from '../../gui/guipositionheader.js';
import { listener_document, listener_canvas } from '../../../../game/listeners.js';

// State -----------------------------------------------------------------------

/** Whether or not we are currently making a selection. */
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

// Events ----------------------------------------------------------------------

// A selection outlives no game: every consumer of one (copy/cut/paste, the Delete shortcut)
// reads the gamefile it was made against, and a discarded load leaves none behind.
GameBus.addEventListener('game-unloaded', () => resetState());

// Methods ---------------------------------------------------------------------

/** Updates the Selection Tool each frame: its shortcuts, handles, and the selection in progress. */
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
		if (mouse.isMouseDown(MOUSE.LEFT) && !arrowinteraction.areHoveringAtleastOneArrow()) {
			// Start new selection
			mouse.claimMouseDown(MOUSE.LEFT); // Remove the pointer down so other scripts don't use it
			mouse.cancelMouseClick(MOUSE.LEFT); // Cancel any potential future click so other scripts don't use it
			pointerId = mouse.getMouseId(MOUSE.LEFT)!;
			beginSelection();
		}
	} else {
		// Selection in progress
		const respectiveListener = mouse.getRelevantListener();
		// Update its last known position while held, else finalize the new selection
		if (respectiveListener.isPointerHeld(pointerId!))
			lastPointerCoords = mouse.getTilePointerOver_Integer(pointerId!)!;
		else endSelection();
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

/** Begins a new selection at the pointer's square. */
function beginSelection(): void {
	startPoint = undefined;
	endPoint = undefined;
	selecting = true;
	sfill.resetState();
	sdrag.resetState();

	// Set the start point
	startPoint = mouse.getTilePointerOver_Integer(pointerId!)!;
	lastPointerCoords = startPoint;
}

/** Finalizes the selection in progress at the pointer's last square. */
function endSelection(): void {
	// Set the end point
	endPoint = lastPointerCoords;
	guipositionheader.onNewSelection();

	selecting = false;
	pointerId = undefined;
}

/** Clears any selection, made or in progress, along with its handles. */
function resetState(): void {
	selecting = false;
	pointerId = undefined;
	lastPointerCoords = undefined;
	startPoint = undefined;
	endPoint = undefined;
	sfill.resetState();
	sdrag.resetState();
	guipositionheader.onClearSelection();
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
	return selecting || !!endPoint;
}

/** Renders the selection and its handles, or the hovered rank and file when there's none. */
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
		if (listener_canvas.getAllPhysicalPointers().length > 1) return; // Don't render if multiple fingers down
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
	return meshes.applyWorldTransformationsToBoundingBox(boardpos, roundedAwayBox);
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
	etoolmanager.setTool('selection-tool'); // Switch if we're not already using

	const box = boardutil.getBoundingBoxOfAllPieces(gameslot.getGamefile()!.pieces);

	if (box === undefined) {
		// No pieces, cancel selection
		resetState();
		// Optional: Also transition to the selection
		// guinavigation.recenter();
		return;
	}

	startPoint = [box.left, box.top];
	endPoint = [box.right, box.bottom];

	guipositionheader.onNewSelection();
	// Optional: Also transition to the selection
	// Transition.zoomToCoordsBox(box);
}

// Exports ---------------------------------------------------------------------

export default {
	update,
	resetState,
	isExistingSelection,
	render,
	getSelectionIntBox,
	getSelectionWorldBox,
	convertIntBoxToWorldBox,
	setSelection,
	selectAll,
};
