

// @ts-ignore
import guipause from './guipause.js';
// @ts-ignore
import stats from './stats.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import boardutil from '../../chess/util/boardutil.js';
import gameslot from '../chess/gameslot.js';
import moveutil from '../../chess/util/moveutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import selection from '../chess/selection.js';
import mouse from '../../util/mouse.js';
import boardpos from '../rendering/boardpos.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import snapping from '../rendering/highlights/snapping.js';
import boardeditor from '../misc/boardeditor.js';
import guiboardeditor from './guiboardeditor.js';
import bounds from '../../util/math/bounds.js';
import premoves from '../chess/premoves.js';
import bd from '../../util/bigdecimal/bigdecimal.js';
import boardtiles from '../rendering/boardtiles.js';
import transition from '../rendering/transition.js';
import area from '../rendering/area.js';
import { listener_document, listener_overlay } from '../chess/game.js';


/**
 * This script handles the navigation bar, in a game,
 * along the top of the screen, containing the teleporation
 * buttons, rewind move, forward move, and pause buttons.
 */

const element_Navigation = document.getElementById('navigation-bar')!;

// Navigation
const element_Recenter = document.getElementById('recenter')!;
const element_Expand = document.getElementById('expand')!;
const element_Back = document.getElementById('back')!;
const element_Annotations = document.getElementById('annotations')!;
const element_Erase = document.getElementById('erase')!;
const element_Collapse = document.getElementById('collapse')!;

// const element_AnnotationsContainer = document.querySelector('.buttoncontainer.annotations')!;
const element_EraseContainer = document.querySelector('.buttoncontainer.erase')!;
const element_CollapseContainer = document.querySelector('.buttoncontainer.collapse')!;

const element_CoordsX = document.getElementById('x') as HTMLInputElement;
const element_CoordsY = document.getElementById('y') as HTMLInputElement;

const element_moveRewind = document.getElementById('move-left')!;
const element_moveForward = document.getElementById('move-right')!;
const element_undoEdit = document.getElementById('undo-edit')!;
const element_redoEdit = document.getElementById('redo-edit')!;
const element_pause = document.getElementById('pause')!;

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

let rewindIsLocked = false;
const durationToLockRewindAfterMoveForwardingMillis = 750;

/** Whether the navigation UI is visible (not hidden) */
let navigationOpen = true;

/**
 * Whether the annotations button is enabled.
 * If so, all left click actions are treated as right clicks.
 */
let annotationsEnabled: boolean = false;


// Functions

function isOpen() {
	return navigationOpen;
}

/** Called when we push 'N' on the keyboard */
function toggle() {
	if (navigationOpen) close();
	else open({ allowEditCoords: !onlinegame.areInOnlineGame() });
	// Flag next frame to be rendered, since the arrows indicators may change locations with the bars toggled.
	frametracker.onVisualChange();
}

function open({ allowEditCoords = true }: { allowEditCoords?: boolean }) {
	element_Navigation.classList.remove('hidden');
	if (!guiboardeditor.isOpen()) { // Normal game => Show navigate move buttons
		element_moveRewind.classList.remove("hidden");
		element_moveForward.classList.remove("hidden");
		element_undoEdit.classList.add("hidden");
		element_redoEdit.classList.add("hidden");
		update_MoveButtons();
	} else { // Board editor => Show undo/redo edit buttons
		element_moveRewind.classList.add("hidden");
		element_moveForward.classList.add("hidden");
		element_undoEdit.classList.remove("hidden");
		element_redoEdit.classList.remove("hidden");
		update_EditButtons();
	}
	initListeners_Navigation();
	initCoordinates({ allowEditCoords });
	navigationOpen = true;
	stats.updateStatsCSS();
}

function initCoordinates({ allowEditCoords }: { allowEditCoords: boolean }) {
	if (allowEditCoords) {
		element_CoordsX.disabled = false;
		element_CoordsY.disabled = false;
		element_CoordsX.classList.remove('set-cursor-to-not-allowed');
		element_CoordsY.classList.remove('set-cursor-to-not-allowed');
	} else {
		element_CoordsX.disabled = true;
		element_CoordsY.disabled = true;
		element_CoordsX.classList.add('set-cursor-to-not-allowed');
		element_CoordsY.classList.add('set-cursor-to-not-allowed');
	}
}

function close() {
	element_Navigation.classList.add('hidden');
	closeListeners_Navigation();
	navigationOpen = false;
	stats.updateStatsCSS();

	// Disable annotations mode
	annotationsEnabled = false;
	listener_overlay.setTreatLeftasRight(false);
	element_Annotations.classList.remove('enabled');
}






// Update the division on the screen displaying your current coordinates
function updateElement_Coords() {
	if (isCoordinateActive()) return; // Don't update the coordinates if the user is editing them

	const boardPos = boardpos.getBoardPos();
	const mouseTile = mouse.getTileMouseOver_Integer();
	const squareCenter = boardtiles.getSquareCenter();

	// Tile camera is over
	// element_CoordsX.textContent = Math.floor(boardPos[0] + squareCenter)
	// element_CoordsY.textContent = Math.floor(boardPos[1] + squareCenter)

	// Tile mouse over
	element_CoordsX.value = String(mouseTile ? mouseTile[0] : bd.floor(bd.add(boardPos[0], squareCenter)));
	element_CoordsY.value = String(mouseTile ? mouseTile[1] : bd.floor(bd.add(boardPos[1], squareCenter)));
}

/**
 * Returns true if one of the coordinate fields is active (currently editing)
 */
function isCoordinateActive(): boolean {
	return element_CoordsX === document.activeElement || element_CoordsY === document.activeElement;
}

function initListeners_Navigation() {
	element_Recenter.addEventListener('click', recenter);
	element_Expand.addEventListener('click', callback_Expand);
	element_Back.addEventListener('click', callback_Back);
	element_Annotations.addEventListener('click', callback_Annotations);
	element_Erase.addEventListener('click', callback__Collapse);
	element_Collapse.addEventListener('click', callback__Collapse);
	element_pause.addEventListener('click', callback_Pause);

	element_CoordsX.addEventListener('change', callback_CoordsChange);
	element_CoordsY.addEventListener('change', callback_CoordsChange);

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

function closeListeners_Navigation() {
	element_Recenter.removeEventListener('click', recenter);
	element_Expand.removeEventListener('click', callback_Expand);
	element_Back.removeEventListener('click', callback_Back);
	element_Annotations.removeEventListener('click', callback_Annotations);
	element_Erase.removeEventListener('click', callback__Collapse);
	element_Collapse.removeEventListener('click', callback__Collapse);
	element_Back.removeEventListener('click', callback_Pause);

	element_CoordsX.removeEventListener('change', callback_CoordsChange);
	element_CoordsY.removeEventListener('change', callback_CoordsChange);

	if (!guiboardeditor.isOpen()) {
		element_moveRewind.removeEventListener('click', callback_MoveRewind);
		element_moveRewind.removeEventListener('mousedown', callback_MoveRewindMouseDown);
		element_moveRewind.removeEventListener('mouseleave', callback_MoveRewindMouseLeave);
		element_moveRewind.removeEventListener('mouseup', callback_MoveRewindMouseUp);
		element_moveRewind.removeEventListener('touchstart', callback_MoveRewindTouchStart);
		element_moveRewind.removeEventListener('touchmove', callback_MoveRewindTouchMove);
		element_moveRewind.removeEventListener('touchend', callback_MoveRewindTouchEnd);
		element_moveRewind.removeEventListener('touchcancel', callback_MoveRewindTouchEnd);
		element_moveForward.removeEventListener('click', callback_MoveForward);
		element_moveForward.removeEventListener('mousedown', callback_MoveForwardMouseDown);
		element_moveForward.removeEventListener('mouseleave', callback_MoveForwardMouseLeave);
		element_moveForward.removeEventListener('mouseup', callback_MoveForwardMouseUp);
		element_moveForward.removeEventListener('touchstart', callback_MoveForwardTouchStart);
		element_moveForward.removeEventListener('touchmove', callback_MoveForwardTouchMove);
		element_moveForward.removeEventListener('touchend', callback_MoveForwardTouchEnd);
		element_moveForward.removeEventListener('touchcancel', callback_MoveForwardTouchEnd);
	} else {
		element_undoEdit.removeEventListener('click', callback_UndoEdit);
		element_undoEdit.removeEventListener('mousedown', callback_UndoEditMouseDown);
		element_undoEdit.removeEventListener('mouseleave', callback_UndoEditMouseLeave);
		element_undoEdit.removeEventListener('mouseup', callback_UndoEditMouseUp);
		element_undoEdit.removeEventListener('touchstart', callback_UndoEditTouchStart);
		element_undoEdit.removeEventListener('touchmove', callback_UndoEditTouchMove);
		element_undoEdit.removeEventListener('touchend', callback_UndoEditTouchEnd);
		element_undoEdit.removeEventListener('touchcancel', callback_UndoEditTouchEnd);
		element_redoEdit.removeEventListener('click', callback_RedoEdit);
		element_redoEdit.removeEventListener('mousedown', callback_RedoEditMouseDown);
		element_redoEdit.removeEventListener('mouseleave', callback_RedoEditMouseLeave);
		element_redoEdit.removeEventListener('mouseup', callback_RedoEditMouseUp);
		element_redoEdit.removeEventListener('touchstart', callback_RedoEditTouchStart);
		element_redoEdit.removeEventListener('touchmove', callback_RedoEditTouchMove);
		element_redoEdit.removeEventListener('touchend', callback_RedoEditTouchEnd);
		element_redoEdit.removeEventListener('touchcancel', callback_RedoEditTouchEnd);
	}
}

/** Is called when we hit enter after changing one of the coordinate fields */
function callback_CoordsChange() {

	if (element_CoordsX === document.activeElement) element_CoordsX.blur();
	if (element_CoordsY === document.activeElement) element_CoordsY.blur();

	const newX = BigInt(element_CoordsX.value);
	const newY = BigInt(element_CoordsY.value);

	const newPos = bd.FromCoords([newX, newY]);
	boardpos.setBoardPos(newPos);
}

function callback_Back() {
	transition.undoTransition();
}

function callback_Expand() {
	const allCoords = boardutil.getCoordsOfAllPieces(gameslot.getGamefile()!.boardsim.pieces!);
	// Add the square annotation highlights, too.
	allCoords.push(...snapping.getAnnoteSnapPoints(false));
	if (allCoords.length === 0) allCoords.push([1n,1n], [8n,8n]); // use the [1,1]-[8,8] area as a fallback
	area.initTelFromCoordsList(allCoords);
}

function recenter() {
	const boundingBox = boardeditor.areInBoardEditor() ? bounds.getBDBoxFromCoordsList([[1n,1n], [8n,8n]]) :
														 gamefileutility.getStartingAreaBox(gameslot.getGamefile()!.boardsim);
	if (!boundingBox) return console.error("Cannot recenter when the bounding box of the starting position is undefined!");
	area.initTelFromUnpaddedBox(boundingBox); // If you know the bounding box, you don't need a coordinate list
}

// Annotations Buttons ======================================

function callback_Annotations() {
	annotationsEnabled = !annotationsEnabled;
	listener_overlay.setTreatLeftasRight(annotationsEnabled);
	element_Annotations.classList.toggle('enabled');
}

function callback__Collapse() {
	annotations.Collapse();
}

document.addEventListener('ray-count-change', (e: CustomEvent) => {
	const rayCount = e.detail;
	if (rayCount > 0) {
		element_EraseContainer.classList.add('hidden');
		element_CollapseContainer.classList.remove('hidden');
	} else { // Zero rays
		element_EraseContainer.classList.remove('hidden');
		element_CollapseContainer.classList.add('hidden');
	}
});


// =====================================================================

/**
 * Returns true if the coords input box is currently not allowed to be edited.
 * This was set at the time they were opened.
 */
function areCoordsAllowedToBeEdited() {
	return !element_CoordsX.disabled;
}

/** Returns the height of the navigation bar in the document, in virtual pixels. */
function getHeightOfNavBar(): number {
	return element_Navigation.getBoundingClientRect().height;
}

function callback_Pause() {
	guipause.open();
}

/** Tests if the arrow keys have been pressed outisde of the board editor, signaling to rewind/forward the game. */
function update() {
	if (!guiboardeditor.isOpen()) {
		testIfRewindMove();
		testIfForwardMove();
	} else {
		testIfUndoEdit();
		testIfRedoEdit();
	}
	
}


// Move Buttons =====================================================


function callback_MoveRewind() {
	if (rewindIsLocked) return;
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrEdit = Date.now();
	rewindMove();
}

function callback_MoveForward() {
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrEdit = Date.now();
	forwardMove();
}

function isItOkayToRewindOrForward() {
	const timeSincelastRewindOrEdit = Date.now() - lastRewindOrEdit;
	return timeSincelastRewindOrEdit >= minimumRewindOrEditIntervalMillis; // True if enough time has passed!
}

/**
 * Makes the rewind/forward move buttons transparent if we're at
 * the very beginning or end of the game.
 */
function update_MoveButtons() {
	const gamefile = gameslot.getGamefile()!;
	const decrementingLegal = moveutil.isDecrementingLegal(gamefile.boardsim);
	const incrementingLegal = moveutil.isIncrementingLegal(gamefile.boardsim);

	if (decrementingLegal) element_moveRewind.classList.remove('opacity-0_5');
	else element_moveRewind.classList.add('opacity-0_5');

	if (incrementingLegal) element_moveForward.classList.remove('opacity-0_5');
	else element_moveForward.classList.add('opacity-0_5');
}

// Mouse

function callback_MoveRewindMouseDown() {
	leftArrowTimeoutID = setTimeout(() => {
		leftArrowIntervalID = setInterval(() => {
			callback_MoveRewind();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveRewindMouseLeave() {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveRewindMouseUp() {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveForwardMouseDown() {
	rightArrowTimeoutID = setTimeout(() => {
		rightArrowIntervalID = setInterval(() => {
			callback_MoveForward();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveForwardMouseLeave() {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_MoveForwardMouseUp() {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

// Fingers

function callback_MoveRewindTouchStart() {
	touchIsInsideLeft = true;
	leftArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideLeft) return;
		leftArrowIntervalID = setInterval(() => {
			callback_MoveRewind();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveRewindTouchMove(event: TouchEvent) {
	if (!touchIsInsideLeft) return;
	const touch = event.touches[0]!;
	const rect = element_moveRewind.getBoundingClientRect();
	if (touch.clientX > rect.left &&
        touch.clientX < rect.right &&
        touch.clientY > rect.top &&
        touch.clientY < rect.bottom) return;

	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveRewindTouchEnd() {
	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_MoveForwardTouchStart() {
	touchIsInsideRight = true;
	rightArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideRight) return;
		rightArrowIntervalID = setInterval(() => {
			callback_MoveForward();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_MoveForwardTouchMove(event: TouchEvent) {
	event = event || window.event;
	if (!touchIsInsideRight) return;
	const touch = event.touches[0]!;
	const rect = element_moveForward.getBoundingClientRect();
	if (touch.clientX > rect.left &&
        touch.clientX < rect.right &&
        touch.clientY > rect.top &&
        touch.clientY < rect.bottom) return;

	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_MoveForwardTouchEnd() {
	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

/**
 * Locks the rewind button for a brief moment. Typically called after forwarding the moves to the front.
 * This is so if our opponent moves while we're rewinding, there's a brief pause.
 */
function lockRewind() {
	rewindIsLocked = true;
	lockLayers++;
	setTimeout(() => {
		lockLayers--;
		if (lockLayers > 0) return;
		rewindIsLocked = false;
	}, durationToLockRewindAfterMoveForwardingMillis); 
}
let lockLayers = 0;

/** Tests if the left arrow key has been pressed, signaling to rewind the game. */
function testIfRewindMove() {
	if (!listener_document.isKeyDown('ArrowLeft')) return;
	if (rewindIsLocked) return;
	rewindMove();
}

/** Tests if the right arrow key has been pressed, signaling to forward the game. */
function testIfForwardMove() {
	if (!listener_document.isKeyDown('ArrowRight')) return;
	forwardMove();
}

/** Rewinds the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function rewindMove() {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	const hadAtleastOnePremove = premoves.hasAtleastOnePremove();
	premoves.cancelPremoves(gamefile, mesh);
	// If we had premoves to cancel, just cancel them, don't rewind a move this time.
	if (hadAtleastOnePremove) return;

	if (!moveutil.isDecrementingLegal(gamefile.boardsim)) return stats.showMoves();

	frametracker.onVisualChange();

	movesequence.navigateMove(gamefile, mesh, false);
    
	selection.unselectPiece();
}

/** Forwards the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function forwardMove() {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);
	
	if (!moveutil.isIncrementingLegal(gamefile.boardsim)) return stats.showMoves();

	movesequence.navigateMove(gamefile, mesh, true);
}

// Edit Buttons =====================================================

function isItOkayToUndoEditOrRedoEdit() {
	const timeSincelastRewindOrEdit = Date.now() - lastRewindOrEdit;
	return timeSincelastRewindOrEdit >= minimumRewindOrEditIntervalMillis; // True if enough time has passed!
}

/**
 * Makes the undo/redo move buttons transparent if we're at
 * the very beginning or end of the edits.
 */
function update_EditButtons() {
	if (boardeditor.canUndo()) element_undoEdit.classList.remove('opacity-0_5');
	else element_undoEdit.classList.add('opacity-0_5');

	if (boardeditor.canRedo()) element_redoEdit.classList.remove('opacity-0_5');
	else element_redoEdit.classList.add('opacity-0_5');
}

// Mouse

function callback_UndoEditMouseDown() {
	leftArrowTimeoutID = setTimeout(() => {
		leftArrowIntervalID = setInterval(() => {
			callback_UndoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_UndoEditMouseLeave() {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_UndoEditMouseUp() {
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_RedoEditMouseDown() {
	rightArrowTimeoutID = setTimeout(() => {
		rightArrowIntervalID = setInterval(() => {
			callback_RedoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_RedoEditMouseLeave() {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_RedoEditMouseUp() {
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

// Fingers

function callback_UndoEditTouchStart() {
	touchIsInsideLeft = true;
	leftArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideLeft) return;
		leftArrowIntervalID = setInterval(() => {
			callback_UndoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_UndoEditTouchMove(event: TouchEvent) {
	if (!touchIsInsideLeft) return;
	const touch = event.touches[0]!;
	const rect = element_moveRewind.getBoundingClientRect();
	if (touch.clientX > rect.left &&
        touch.clientX < rect.right &&
        touch.clientY > rect.top &&
        touch.clientY < rect.bottom) return;

	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_UndoEditTouchEnd() {
	touchIsInsideLeft = false;
	clearTimeout(leftArrowTimeoutID);
	clearInterval(leftArrowIntervalID);
}

function callback_RedoEditTouchStart() {
	touchIsInsideRight = true;
	rightArrowTimeoutID = setTimeout(() => {
		if (!touchIsInsideRight) return;
		rightArrowIntervalID = setInterval(() => {
			callback_RedoEdit();
		}, intervalToRepeat);
	}, timeToHoldMillis);
}

function callback_RedoEditTouchMove(event: TouchEvent) {
	event = event || window.event;
	if (!touchIsInsideRight) return;
	const touch = event.touches[0]!;
	const rect = element_moveForward.getBoundingClientRect();
	if (touch.clientX > rect.left &&
        touch.clientX < rect.right &&
        touch.clientY > rect.top &&
        touch.clientY < rect.bottom) return;

	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

function callback_RedoEditTouchEnd() {
	touchIsInsideRight = false;
	clearTimeout(rightArrowTimeoutID);
	clearInterval(rightArrowIntervalID);
}

/** Tests if the left arrow key has been pressed, signaling to undo an edit. */
function testIfUndoEdit() {
	if (!listener_document.isKeyDown('ArrowLeft')) return;
	callback_UndoEdit();
}

/** Tests if the right arrow key has been pressed, signaling to redo and edit. */
function testIfRedoEdit() {
	if (!listener_document.isKeyDown('ArrowRight')) return;
	callback_RedoEdit();
}

/** Undoes one edit */
function callback_UndoEdit() {
	if (!isItOkayToUndoEditOrRedoEdit()) return;
	lastRewindOrEdit = Date.now();
	boardeditor.undo();
}

/** Redoes one edit. */
function callback_RedoEdit() {
	if (!isItOkayToUndoEditOrRedoEdit()) return;
	lastRewindOrEdit = Date.now();
	boardeditor.redo();
}

export default {
	isOpen,
	open,
	close,
	updateElement_Coords,
	update_MoveButtons,
	update_EditButtons,
	callback_Pause,
	lockRewind,
	update,
	isCoordinateActive,
	recenter,
	toggle,
	areCoordsAllowedToBeEdited,
	getHeightOfNavBar,
};