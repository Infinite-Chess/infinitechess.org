// src/client/scripts/esm/game/gui/guinavigation.ts

/**
 * This script handles the navigation bar, in a game,
 * along the top of the screen, containing the teleporation
 * buttons, rewind move, forward move, and pause buttons.
 */

import moveutil from '../../../../../shared/chess/util/moveutil.js';

import gameslot from '../chess/gameslot.js';
import premoves from '../chess/premoves.js';
import selection from '../chess/selection.js';
import edithistory from '../boardeditor/edithistory.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import guiboardeditor from './boardeditor/guiboardeditor.js';
import { listener_document } from '../chess/game.js';

// Navigation

const element_moveRewind = document.getElementById('move-left')!;
const element_moveForward = document.getElementById('move-right')!;
const element_undoEdit = document.getElementById('undo-edit')!;
const element_redoEdit = document.getElementById('redo-edit')!;

const timeToHoldMillis = 250; // After holding the button this long, moves will fast-rewind or edits will fast undo/redo
const intervalToRepeat = 40; // Default 40. How quickly moves will fast-rewind or edits will fast undo/redo
const minimumRewindOrEditIntervalMillis = 20; // Rewinding, forwarding, undoing and redoing can never be spammed faster than this
let lastRewindOrEdit = 0;

let leftArrowTimeoutID: ReturnType<typeof setTimeout>; // setTimeout to BEGIN rewinding or undoing
let leftArrowIntervalID: ReturnType<typeof setTimeout>; // setInterval to CONTINUE rewinding or undoing
let touchIsInsideLeft = false;

let rightArrowTimeoutID: ReturnType<typeof setTimeout>; // setTimeout to BEGIN forwarding or redoing
let rightArrowIntervalID: ReturnType<typeof setTimeout>; // setInterval to CONTINUE forwarding or redoing
let touchIsInsideRight = false;

// =============================== Coordinate Fields ===============================

// =================================================================================

function _initListeners_Navigation(): void {
	if (!guiboardeditor.isOpen()) {
		element_moveRewind.addEventListener('click', callback_MoveRewind);
		element_moveRewind.addEventListener('mousedown', callback_MoveRewindMouseDown);
		element_moveRewind.addEventListener('mouseleave', callback_MoveRewindMouseLeave);
		element_moveRewind.addEventListener('mouseup', callback_MoveRewindMouseUp);
		element_moveRewind.addEventListener('touchstart', callback_MoveRewindTouchStart);
		element_moveRewind.addEventListener('touchmove', callback_MoveRewindTouchMove);
		element_moveRewind.addEventListener('touchend', callback_MoveRewindTouchEnd);
		element_moveRewind.addEventListener('touchcancel', callback_MoveRewindTouchEnd);
		element_moveForward.addEventListener('click', callback_MoveForward);
		element_moveForward.addEventListener('mousedown', callback_MoveForwardMouseDown);
		element_moveForward.addEventListener('mouseleave', callback_MoveForwardMouseLeave);
		element_moveForward.addEventListener('mouseup', callback_MoveForwardMouseUp);
		element_moveForward.addEventListener('touchstart', callback_MoveForwardTouchStart);
		element_moveForward.addEventListener('touchmove', callback_MoveForwardTouchMove);
		element_moveForward.addEventListener('touchend', callback_MoveForwardTouchEnd);
		element_moveForward.addEventListener('touchcancel', callback_MoveForwardTouchEnd);
	} else {
		element_undoEdit.addEventListener('click', callback_UndoEdit);
		element_undoEdit.addEventListener('mousedown', callback_UndoEditMouseDown);
		element_undoEdit.addEventListener('mouseleave', callback_UndoEditMouseLeave);
		element_undoEdit.addEventListener('mouseup', callback_UndoEditMouseUp);
		element_undoEdit.addEventListener('touchstart', callback_UndoEditTouchStart);
		element_undoEdit.addEventListener('touchmove', callback_UndoEditTouchMove);
		element_undoEdit.addEventListener('touchend', callback_UndoEditTouchEnd);
		element_undoEdit.addEventListener('touchcancel', callback_UndoEditTouchEnd);
		element_redoEdit.addEventListener('click', callback_RedoEdit);
		element_redoEdit.addEventListener('mousedown', callback_RedoEditMouseDown);
		element_redoEdit.addEventListener('mouseleave', callback_RedoEditMouseLeave);
		element_redoEdit.addEventListener('mouseup', callback_RedoEditMouseUp);
		element_redoEdit.addEventListener('touchstart', callback_RedoEditTouchStart);
		element_redoEdit.addEventListener('touchmove', callback_RedoEditTouchMove);
		element_redoEdit.addEventListener('touchend', callback_RedoEditTouchEnd);
		element_redoEdit.addEventListener('touchcancel', callback_RedoEditTouchEnd);
	}
}

// =====================================================================

/** Tests if the arrow keys have been pressed outisde of the board editor, signaling to rewind/forward the game. */
function update(): void {
	if (!guiboardeditor.isOpen()) {
		testIfRewindMove();
		testIfForwardMove();
	} else {
		testIfUndoEdit();
		testIfRedoEdit();
	}
}

// Move Buttons =====================================================

function callback_MoveRewind(): void {
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrEdit = Date.now();
	rewindMove();
}

function callback_MoveForward(): void {
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrEdit = Date.now();
	forwardMove();
}

function isItOkayToRewindOrForward(): boolean {
	const timeSincelastRewindOrEdit = Date.now() - lastRewindOrEdit;
	return timeSincelastRewindOrEdit >= minimumRewindOrEditIntervalMillis; // True if enough time has passed!
}

/**
 * Makes the rewind/forward move buttons transparent if we're at
 * the very beginning or end of the game.
 */
function update_MoveButtons(): void {
	const gamefile = gameslot.getGamefile()!;
	const decrementingLegal = moveutil.isDecrementingLegal(gamefile);
	const incrementingLegal = moveutil.isIncrementingLegal(gamefile);

	if (decrementingLegal) element_moveRewind.classList.remove('opacity-0_5');
	else element_moveRewind.classList.add('opacity-0_5');

	if (incrementingLegal) element_moveForward.classList.remove('opacity-0_5');
	else element_moveForward.classList.add('opacity-0_5');
}

// Mouse

function callback_MoveRewindMouseDown(): void {
	leftArrowTimeoutID = setTimeout(() => {
		leftArrowIntervalID = setInterval(() => {
			callback_MoveRewind();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveRewindMouseLeave(): void {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveRewindMouseUp(): void {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveForwardMouseDown(): void {
	rightArrowTimeoutID = setTimeout(() => {
		rightArrowIntervalID = setInterval(() => {
			callback_MoveForward();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveForwardMouseLeave(): void {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_MoveForwardMouseUp(): void {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

// Fingers

function callback_MoveRewindTouchStart(): void {
	touchIsInsideLeft = true;
	leftArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideLeft) return;
		leftArrowIntervalID = setInterval(() => {
			callback_MoveRewind();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveRewindTouchMove(event: TouchEvent): void {
	if (!touchIsInsideLeft) return;
	const touch = event.touches[0]!;
	const rect = element_moveRewind.getBoundingClientRect();
	if (
		touch.clientX > rect.left &&
		touch.clientX < rect.right &&
		touch.clientY > rect.top &&
		touch.clientY < rect.bottom
	)
		return;

	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveRewindTouchEnd(): void {
	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveForwardTouchStart(): void {
	touchIsInsideRight = true;
	rightArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideRight) return;
		rightArrowIntervalID = setInterval(() => {
			callback_MoveForward();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveForwardTouchMove(event: TouchEvent): void {
	event = event || window.event;
	if (!touchIsInsideRight) return;
	const touch = event.touches[0]!;
	const rect = element_moveForward.getBoundingClientRect();
	if (
		touch.clientX > rect.left &&
		touch.clientX < rect.right &&
		touch.clientY > rect.top &&
		touch.clientY < rect.bottom
	)
		return;

	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_MoveForwardTouchEnd(): void {
	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

/** Tests if the left arrow key has been pressed, signaling to rewind the game. */
function testIfRewindMove(): void {
	if (!listener_document.isKeyDown('ArrowLeft')) return;
	rewindMove();
}

/** Tests if the right arrow key has been pressed, signaling to forward the game. */
function testIfForwardMove(): void {
	if (!listener_document.isKeyDown('ArrowRight')) return;
	forwardMove();
}

/** Rewinds the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function rewindMove(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	const hadAtleastOnePremove = premoves.hasAtleastOnePremove();
	premoves.cancelPremoves(gamefile, mesh);
	// If we had premoves to cancel, just cancel them, don't rewind a move this time.
	if (hadAtleastOnePremove) return;

	if (!moveutil.isDecrementingLegal(gamefile)) return;

	frametracker.onVisualChange();

	movesequence.navigateMove(gamefile, mesh, false);

	selection.unselectPiece();
}

/** Forwards the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function forwardMove(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile)) return;

	movesequence.navigateMove(gamefile, mesh, true);
}

// Edit Buttons =====================================================

function isItOkayToUndoEditOrRedoEdit(): boolean {
	const timeSincelastRewindOrEdit = Date.now() - lastRewindOrEdit;
	return timeSincelastRewindOrEdit >= minimumRewindOrEditIntervalMillis; // True if enough time has passed!
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

// Mouse

function callback_UndoEditMouseDown(): void {
	leftArrowTimeoutID = setTimeout(() => {
		leftArrowIntervalID = setInterval(() => {
			callback_UndoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_UndoEditMouseLeave(): void {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_UndoEditMouseUp(): void {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_RedoEditMouseDown(): void {
	rightArrowTimeoutID = setTimeout(() => {
		rightArrowIntervalID = setInterval(() => {
			callback_RedoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_RedoEditMouseLeave(): void {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_RedoEditMouseUp(): void {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

// Fingers

function callback_UndoEditTouchStart(): void {
	touchIsInsideLeft = true;
	leftArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideLeft) return;
		leftArrowIntervalID = setInterval(() => {
			callback_UndoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_UndoEditTouchMove(event: TouchEvent): void {
	if (!touchIsInsideLeft) return;
	const touch = event.touches[0]!;
	const rect = element_moveRewind.getBoundingClientRect();
	if (
		touch.clientX > rect.left &&
		touch.clientX < rect.right &&
		touch.clientY > rect.top &&
		touch.clientY < rect.bottom
	)
		return;

	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_UndoEditTouchEnd(): void {
	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_RedoEditTouchStart(): void {
	touchIsInsideRight = true;
	rightArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideRight) return;
		rightArrowIntervalID = setInterval(() => {
			callback_RedoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_RedoEditTouchMove(event: TouchEvent): void {
	event = event || window.event;
	if (!touchIsInsideRight) return;
	const touch = event.touches[0]!;
	const rect = element_moveForward.getBoundingClientRect();
	if (
		touch.clientX > rect.left &&
		touch.clientX < rect.right &&
		touch.clientY > rect.top &&
		touch.clientY < rect.bottom
	)
		return;

	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_RedoEditTouchEnd(): void {
	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
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
	lastRewindOrEdit = Date.now();
	edithistory.undo();
}

/** Redoes one edit. */
function callback_RedoEdit(): void {
	if (!isItOkayToUndoEditOrRedoEdit()) return;
	lastRewindOrEdit = Date.now();
	edithistory.redo();
}

export default {
	update_MoveButtons,
	update_EditButtons,
	update,
};
