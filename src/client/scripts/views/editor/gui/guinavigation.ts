// src/client/scripts/views/editor/gui/guinavigation.ts

/**
 * Greys out the board editor's undo/redo buttons when there is nothing left to
 * undo or redo.
 *
 * To be repurposed when redesigning the board editor page.
 */

import holdrepeat from '../../../components/holdrepeat.js';
import edithistory from '../edithistory.js';
import { listener_document } from '../../../game/listeners.js';

// Elements --------------------------------------------------------------------

const element_undoEdit = document.getElementById('undo-edit')!;
const element_redoEdit = document.getElementById('redo-edit')!;

// Constants -------------------------------------------------------------------

/** Throttles undo/redo: a held button or arrow key can't fire faster than this. */
const MINIMUM_EDIT_INTERVAL_MS = 20;

// State -----------------------------------------------------------------------

/** When the last undo/redo ran, for the throttle. */
let lastEdit = 0;

// Functions -------------------------------------------------------------------

/** Wires the undo/redo buttons to repeat while held. */
function _initListeners_Navigation(): void {
	holdrepeat.make(element_undoEdit, callback_UndoEdit);
	holdrepeat.make(element_redoEdit, callback_RedoEdit);
}

// FUTURE: Move to all call within board editor code
/** Tests if the arrow keys have been pressed, signaling to undo/redo edit. */
function _updateEditButtons(): void {
	testIfUndoEdit();
	testIfRedoEdit();
}

/** Whether enough time has passed since the last undo/redo for another. */
function isItOkayToUndoEditOrRedoEdit(): boolean {
	const timeSinceLastEdit = Date.now() - lastEdit;
	return timeSinceLastEdit >= MINIMUM_EDIT_INTERVAL_MS;
}

/**
 * Makes the undo/redo move buttons transparent if we're at
 * the very beginning or end of the edits.
 */
function update_EditButtons(): void {
	if (edithistory.canUndo()) element_undoEdit.classList.remove('opacity-0_5');
	else element_undoEdit.classList.add('opacity-0_5');

	if (edithistory.canRedo()) element_redoEdit.classList.remove('opacity-0_5');
	else element_redoEdit.classList.add('opacity-0_5');
}

/** Tests if the left arrow key has been pressed, signaling to undo an edit. */
function testIfUndoEdit(): void {
	if (!listener_document.isKeyDown('ArrowLeft')) return;
	callback_UndoEdit();
}

/** Tests if the right arrow key has been pressed, signaling to redo an edit. */
function testIfRedoEdit(): void {
	if (!listener_document.isKeyDown('ArrowRight')) return;
	callback_RedoEdit();
}

/** Undoes one edit */
function callback_UndoEdit(): void {
	if (!isItOkayToUndoEditOrRedoEdit()) return;
	lastEdit = Date.now();
	edithistory.undo();
}

/** Redoes one edit. */
function callback_RedoEdit(): void {
	if (!isItOkayToUndoEditOrRedoEdit()) return;
	lastEdit = Date.now();
	edithistory.redo();
}

// Exports ---------------------------------------------------------------------

export default {
	update_EditButtons,
};
