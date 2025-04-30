
import onlinegame from '../misc/onlinegame/onlinegame.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import boardutil from '../../chess/util/boardutil.js';
import gameslot from '../chess/gameslot.js';
import moveutil from '../../chess/util/moveutil.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import selection from '../chess/selection.js';
import { listener_document } from '../chess/game.js';
import mouse from '../../util/mouse.js';
import boardpos from '../rendering/boardpos.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';
// @ts-ignore
import board from '../rendering/board.js';
// @ts-ignore
import guipause from './guipause.js';
// @ts-ignore
import area from '../rendering/area.js';
// @ts-ignore
import transition from '../rendering/transition.js';
// @ts-ignore
import statustext from './statustext.js';
// @ts-ignore
import stats from './stats.js';


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

const element_CoordsX = document.getElementById('x') as HTMLInputElement;
const element_CoordsY = document.getElementById('y') as HTMLInputElement;

const element_moveRewind = document.getElementById('move-left')!;
const element_moveForward = document.getElementById('move-right')!;
const element_pause = document.getElementById('pause')!;

const MAX_TELEPORT_DIST = Infinity;

const timeToHoldMillis = 250; // After holding the button this long, moves will fast-rewind
const intervalToRepeat = 40; // Default 40. How quickly moves will fast-rewind
const minimumRewindIntervalMillis = 20; // Rewinding can never be spammed faster than this
let lastRewindOrForward = 0;

let leftArrowTimeoutID: ReturnType<typeof setTimeout>; // setTimeout to BEGIN rewinding
let leftArrowIntervalID: ReturnType<typeof setTimeout>; // setInterval to CONTINUE rewinding
let touchIsInsideLeft = false;

let rightArrowTimeoutID: ReturnType<typeof setTimeout>; // setTimeout to BEGIN rewinding
let rightArrowIntervalID: ReturnType<typeof setTimeout>; // setInterval to CONTINUE rewinding
let touchIsInsideRight = false;

let rewindIsLocked = false;
const durationToLockRewindAfterMoveForwardingMillis = 750;

/** Whether the navigation UI is visible (not hidden) */
let navigationOpen = true;


// Functions'

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
	initListeners_Navigation();
	update_MoveButtons();
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
}






// Update the division on the screen displaying your current coordinates
function updateElement_Coords() {
	if (isCoordinateActive()) return; // Don't update the coordinates if the user is editing them

	const boardPos = boardpos.getBoardPos();
	const mouseTile = mouse.getTileMouseOver_Integer();
	const squareCenter = board.gsquareCenter();

	// Tile camera is over
	// element_CoordsX.textContent = Math.floor(boardPos[0] + squareCenter)
	// element_CoordsY.textContent = Math.floor(boardPos[1] + squareCenter)

	// Tile mouse over
	element_CoordsX.value = String(mouseTile ? mouseTile[0] : Math.floor(boardPos[0] + squareCenter));
	element_CoordsY.value = String(mouseTile ? mouseTile[1] : Math.floor(boardPos[1] + squareCenter));
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
	element_pause.addEventListener('click', callback_Pause);

	element_CoordsX.addEventListener('change', callback_CoordsChange);
	element_CoordsY.addEventListener('change', callback_CoordsChange);
}

function closeListeners_Navigation() {
	element_Recenter.removeEventListener('click', recenter);
	element_Expand.removeEventListener('click', callback_Expand);
	element_Back.removeEventListener('click', callback_Back);
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
	element_Back.removeEventListener('click', callback_Pause);

	element_CoordsX.removeEventListener('change', callback_CoordsChange);
	element_CoordsY.removeEventListener('change', callback_CoordsChange);
}

/** Is called when we hit enter after changing one of the coordinate fields */
function callback_CoordsChange() {

	if (element_CoordsX === document.activeElement) element_CoordsX.blur();
	if (element_CoordsY === document.activeElement) element_CoordsY.blur();

	const newX = Number(element_CoordsX.value);
	const newY = Number(element_CoordsY.value);
	// Make sure the teleport distance doesn't exceed the cap
	if (newX < -MAX_TELEPORT_DIST || newX > MAX_TELEPORT_DIST || newY < -MAX_TELEPORT_DIST || newY > MAX_TELEPORT_DIST) {
		statustext.showStatus(`Cannot teleport more than ${MAX_TELEPORT_DIST} squares in any direction.`, true);
		return;
	}

	boardpos.setBoardPos([newX, newY]);
}

function callback_Back() {
	transition.telToPrevTel();
}

function callback_Expand() {
	const allCoords = boardutil.getCoordsOfAllPieces(gameslot.getGamefile()!.pieces!);
	allCoords.push(...drawsquares.highlights);
	area.initTelFromCoordsList(allCoords);
}

function recenter() {
	const boundingBox = gamefileutility.getStartingAreaBox(gameslot.getGamefile()!);
	if (!boundingBox) return console.error("Cannot recenter when the bounding box of the starting position is undefined!");
	area.initTelFromUnpaddedBox(boundingBox); // If you know the bounding box, you don't need a coordinate list
}

function callback_MoveRewind() {
	if (rewindIsLocked) return;
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrForward = Date.now();
	rewindMove();
}

function callback_MoveForward() {
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrForward = Date.now();
	forwardMove();
}

function isItOkayToRewindOrForward() {
	const timeSinceLastRewindOrForward = Date.now() - lastRewindOrForward;
	return timeSinceLastRewindOrForward >= minimumRewindIntervalMillis; // True if enough time has passed!
}

/**
 * Makes the rewind/forward move buttons transparent if we're at
 * the very beginning or end of the game.
 */
function update_MoveButtons() {
	const gamefile = gameslot.getGamefile()!;
	const decrementingLegal = moveutil.isDecrementingLegal(gamefile);
	const incrementingLegal = moveutil.isIncrementingLegal(gamefile);

	if (decrementingLegal) element_moveRewind.classList.remove('opacity-0_5');
	else element_moveRewind.classList.add('opacity-0_5');

	if (incrementingLegal) element_moveForward.classList.remove('opacity-0_5');
	else element_moveForward.classList.add('opacity-0_5');
}

function callback_Pause() {
	guipause.open();
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

/** Tests if the arrow keys have been pressed, signaling to rewind/forward the game. */
function update() {
	testIfRewindMove();
	testIfForwardMove();
}

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
	if (!moveutil.isDecrementingLegal(gamefile)) return stats.showMoves();

	frametracker.onVisualChange();

	movesequence.navigateMove(gamefile, false);
    
	selection.unselectPiece();
}

/** Forwards the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function forwardMove() {
	const gamefile = gameslot.getGamefile()!;
	if (!moveutil.isIncrementingLegal(gamefile)) return stats.showMoves();

	movesequence.navigateMove(gamefile, true);
}

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

export default {
	isOpen,
	open,
	close,
	updateElement_Coords,
	update_MoveButtons,
	callback_Pause,
	lockRewind,
	update,
	isCoordinateActive,
	recenter,
	toggle,
	areCoordsAllowedToBeEdited,
	getHeightOfNavBar,
};