
// Import Start
import board from '../rendering/board.js';
import moveutil from '../../chess/util/moveutil.js';
import movement from '../rendering/movement.js';
import game from '../chess/game.js';
import style from './style.js';
import input from '../input.js';
import guipause from './guipause.js';
import area from '../rendering/area.js';
import transition from '../rendering/transition.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import statustext from './statustext.js';
import stats from './stats.js';
import movepiece from '../../chess/logic/movepiece.js';
import selection from '../chess/selection.js';
import frametracker from '../rendering/frametracker.js';
// Import End

"use strict";

/**
 * This script handles the navigation bar, in a game,
 * along the top of the screen, containing the teleporation
 * buttons, rewind move, forward move, and pause buttons.
 */

const element_Navigation = document.getElementById('navigation');

// Navigation
const element_Recenter = document.getElementById('recenter');
const element_Expand = document.getElementById('expand');
const element_Back = document.getElementById('back');

const element_CoordsX = document.getElementById('x');
const element_CoordsY = document.getElementById('y');

const element_moveRewind = document.getElementById('move-left');
const element_moveForward = document.getElementById('move-right');
const element_pause = document.getElementById('pause');

const MAX_TELEPORT_DIST = 100;
const TELEPORTING_ENABLED = true;

const timeToHoldMillis = 250; // After holding the button this long, moves will fast-rewind
const intervalToRepeat = 40; // Default 40. How quickly moves will fast-rewind
const minimumRewindIntervalMillis = 20; // Rewinding can never be spammed faster than this
let lastRewindOrForward = 0;

let leftArrowTimeoutID; // setTimeout to BEGIN rewinding
let leftArrowIntervalID; // setInterval to CONTINUE rewinding
let touchIsInsideLeft = false;

let rightArrowTimeoutID; // setTimeout to BEGIN rewinding
let rightArrowIntervalID; // setInterval to CONTINUE rewinding
let touchIsInsideRight = false;

let rewindIsLocked = false;
const durationToLockRewindAfterMoveForwardingMillis = 750;



// Functions

function open() {
	style.revealElement(element_Navigation);
	initListeners_Navigation();
	update_MoveButtons();
}

function close() {
	style.hideElement(element_Navigation);
	closeListeners_Navigation();
}

// Update the division on the screen displaying your current coordinates
function updateElement_Coords() {
	const boardPos = movement.getBoardPos();

	// Tile camera is over
	// element_CoordsX.textContent = Math.floor(boardPos[0] + board.gsquareCenter())
	// element_CoordsY.textContent = Math.floor(boardPos[1] + board.gsquareCenter())

	// Tile mouse over
	if (!isCoordinateActive()) { // Don't update the coordinates if the user is editing them
		element_CoordsX.value = board.gtile_MouseOver_Int() ? board.gtile_MouseOver_Int()[0] : Math.floor(boardPos[0] + board.gsquareCenter());
		element_CoordsY.value = board.gtile_MouseOver_Int() ? board.gtile_MouseOver_Int()[1] : Math.floor(boardPos[1] + board.gsquareCenter());
	}
}

function isCoordinateActive() {
	return element_CoordsX === document.activeElement || element_CoordsY === document.activeElement;
}

function initListeners_Navigation() {
	element_Navigation.addEventListener("mousedown", input.doIgnoreMouseDown);
	//element_Navigation.addEventListener("mouseup", input.doIgnoreMouseDown)
	element_Navigation.addEventListener("touchstart", input.doIgnoreMouseDown);
	//element_Navigation.addEventListener("touchend", input.doIgnoreMouseDown)

	element_Recenter.addEventListener('click', callback_Recenter);
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
	element_Navigation.removeEventListener("mousedown", input.doIgnoreMouseDown);
	//element_Navigation.removeEventListener("mouseup", input.doIgnoreMouseDown)
	element_Navigation.removeEventListener("touchstart", input.doIgnoreMouseDown);
	//element_Navigation.removeEventListener("touchend", input.doIgnoreMouseDown)

	element_Recenter.removeEventListener('click', callback_Recenter);
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

function callback_CoordsChange(event) {
	event = event || window.event;
	if (element_CoordsX === document.activeElement) {
		element_CoordsX.blur();
	}
	if (element_CoordsY === document.activeElement) {
		element_CoordsY.blur();
	}
	if (!TELEPORTING_ENABLED) {
		statustext.showStatus("Cannot teleport in this gamemode.", true);
		return;
	}
	const newX = element_CoordsX.value;
	const newY = element_CoordsY.value;
	if (newX < -MAX_TELEPORT_DIST || newX > MAX_TELEPORT_DIST || newY < -MAX_TELEPORT_DIST || newY > MAX_TELEPORT_DIST) {
		statustext.showStatus(`Cannot teleport more than ${MAX_TELEPORT_DIST} squares in any direction.`, true);
		return;
	}
	movement.setBoardPos([Number(newX), Number(newY)]);
}

function callback_Back(event) {
	event = event || window.event;
	transition.telToPrevTel();
}

function callback_Expand(event) {
	event = event || window.event;
	const allCoords = gamefileutility.getCoordsOfAllPieces(game.getGamefile());
	area.initTelFromCoordsList(allCoords);
}

function callback_Recenter(event) {
	event = event || window.event;

	const boundingBox = game.getGamefile().startSnapshot.box;
	if (!boundingBox) return console.error("Cannot recenter when the bounding box of the starting position is undefined!");
	area.initTelFromUnpaddedBox(boundingBox); // If you know the bounding box, you don't need a coordinate list
}

function callback_MoveRewind(event) {
	event = event || window.event;
	if (rewindIsLocked) return;
	if (!isItOkayToRewindOrForward()) return;
	lastRewindOrForward = Date.now();
	rewindMove();
}

function callback_MoveForward(event) {
	event = event || window.event;
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
	const decrementingLegal = moveutil.isDecrementingLegal(game.getGamefile());
	const incrementingLegal = moveutil.isIncrementingLegal(game.getGamefile());

	if (decrementingLegal) element_moveRewind.classList.remove('opacity-0_5');
	else element_moveRewind.classList.add('opacity-0_5');

	if (incrementingLegal) element_moveForward.classList.remove('opacity-0_5');
	else element_moveForward.classList.add('opacity-0_5');
}

function callback_Pause(event) {
	event = event || window.event;
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

function callback_MoveRewindTouchMove(event) {
	event = event || window.event;
	if (!touchIsInsideLeft) return;
	const touch = event.touches[0];
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

function callback_MoveForwardTouchMove(event) {
	event = event || window.event;
	if (!touchIsInsideRight) return;
	const touch = event.touches[0];
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
	if (!input.isKeyDown('arrowleft')) return;
	if (rewindIsLocked) return;
	rewindMove();
}

/** Tests if the right arrow key has been pressed, signaling to forward the game. */
function testIfForwardMove() {
	if (!input.isKeyDown('arrowright')) return;
	forwardMove();
}

/** Rewinds the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function rewindMove() {
	if (game.getGamefile().mesh.locked) return statustext.pleaseWaitForTask();
	if (!moveutil.isDecrementingLegal(game.getGamefile())) return stats.showMoves();

	frametracker.onVisualChange();

	movepiece.rewindMove(game.getGamefile(), { removeMove: false });
    
	selection.unselectPiece();

	update_MoveButtons();

	stats.showMoves();
}

/** Forwards the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function forwardMove() {
	if (game.getGamefile().mesh.locked) return statustext.pleaseWaitForTask();
	if (!moveutil.isIncrementingLegal(game.getGamefile())) return stats.showMoves();

	const move = moveutil.getMoveOneForward(game.getGamefile());

	// Only leave animate and updateData as true
	movepiece.makeMove(game.getGamefile(), move, { flipTurn: false, recordMove: false, pushClock: false, doGameOverChecks: false, updateProperties: false });

	// transition.teleportToLastMove()

	update_MoveButtons();

	stats.showMoves();
}

export default {
	open,
	close,
	updateElement_Coords,
	update_MoveButtons,
	callback_Pause,
	lockRewind,
	update,
	isCoordinateActive,
};