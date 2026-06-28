// src/client/scripts/esm/game/gui/guinavigation.ts

/**
 * Remaining play-page (play.ejs) GUI logic not yet migrated to the redesigned
 * game page. Currently the board editor's custom undo/redo edit buttons — the
 * future editor page will get its own unique UI to replace this.
 */

import holdrepeat from '../../util/holdrepeat.js';
import edithistory from '../boardeditor/edithistory.js';
import { listener_document } from '../chess/gamecore.js';

// Navigation

const element_undoEdit = document.getElementById('undo-edit')!;
const element_redoEdit = document.getElementById('redo-edit')!;

const minimumEditIntervalMillis = 20; // Undoing and redoing can never be spammed faster than this
let lastEdit = 0;

// =====================================================================

function _initListeners_Navigation(): void {
	holdrepeat.makeHoldRepeatable(element_undoEdit, callback_UndoEdit);
	holdrepeat.makeHoldRepeatable(element_redoEdit, callback_RedoEdit);
}

// =====================================================================

// FUTURE: Move to all call within board editor code
/** Tests if the arrow keys have been pressed, signaling to undo/redo edit. */
function _updateEditButtons(): void {
	testIfUndoEdit();
	testIfRedoEdit();
}

// Edit Buttons =====================================================

function isItOkayToUndoEditOrRedoEdit(): boolean {
	const timeSinceLastEdit = Date.now() - lastEdit;
	return timeSinceLastEdit >= minimumEditIntervalMillis; // True if enough time has passed!
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

/** Tests if the right arrow key has been pressed, signaling to redo and edit. */
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

export default {
	update_EditButtons,
};
