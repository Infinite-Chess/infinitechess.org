// src/client/scripts/esm/game/gui/guinavigation.ts

import type { BDCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import bimath from '../../../../../shared/util/math/bimath.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';

import toast from './toast.js';
import stats from './stats.js';
import mouse from '../../util/mouse.js';
import space from '../misc/space.js';
import guipause from './guipause.js';
import gameslot from '../chess/gameslot.js';
import boardpos from '../rendering/boardpos.js';
import snapping from '../rendering/highlights/snapping.js';
import premoves from '../chess/premoves.js';
import selection from '../chess/selection.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import Transition from '../rendering/transitions/Transition.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import boardeditor from '../boardeditor/boardeditor.js';
import { GameBus } from '../gamebus.js';
import frametracker from '../rendering/frametracker.js';
import movesequence from '../chess/movesequence.js';
import guiboardeditor from './boardeditor/guiboardeditor.js';
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

/**
 * A limit posed against teleporting too far.
 *
 * Don't want players to discover new zones quickly
 * without doing the work of zooming out :)
 * That would decrease the reward.
 *
 * FUTURE: I could allow teleporting up to 1e10000.
 * I roughly determined 1e75000 to be the bound for
 * no noticeable lag in websocket message size.
 * That would still prevent instantly exceeding that.
 */
const TELEPORT_LIMIT: bigint = 10n ** 30n; // 10^30 squares

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

// Events ----------------------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => {
	// Reset Annotations mode button state, without closing the Navigation Bar.
	annotationsEnabled = false;
	listener_overlay.setTreatLeftasRight(false);
	element_Annotations.classList.remove('enabled');

	hideCollapse();
});

// =================================================================================

// Functions

function isOpen(): boolean {
	return navigationOpen;
}

/** Called when we push 'N' on the keyboard */
function toggle(): void {
	if (navigationOpen) close();
	else open({ allowEditCoords: !onlinegame.areInOnlineGame() });
	// Flag next frame to be rendered, since the arrows indicators may change locations with the bars toggled.
	frametracker.onVisualChange();
}

function open({ allowEditCoords = true }: { allowEditCoords?: boolean }): void {
	element_Navigation.classList.remove('hidden');
	if (!guiboardeditor.isOpen()) {
		// Normal game => Show navigate move buttons
		element_moveRewind.classList.remove('hidden');
		element_moveForward.classList.remove('hidden');
		element_undoEdit.classList.add('hidden');
		element_redoEdit.classList.add('hidden');
		update_MoveButtons();
	} else {
		// Board editor => Show undo/redo edit buttons
		element_moveRewind.classList.add('hidden');
		element_moveForward.classList.add('hidden');
		element_undoEdit.classList.remove('hidden');
		element_redoEdit.classList.remove('hidden');
		update_EditButtons();
	}
	initListeners_Navigation();
	initCoordinates({ allowEditCoords });
	navigationOpen = true;
	stats.updateStatsCSS();
}

function initCoordinates({ allowEditCoords }: { allowEditCoords: boolean }): void {
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

function close(): void {
	element_Navigation.classList.add('hidden');
	closeListeners_Navigation();
	navigationOpen = false;
	stats.updateStatsCSS();
}

// =============================== Coordinate Fields ===============================

// Update the division on the screen displaying your current coordinates
function updateElement_Coords(): void {
	if (isCoordinateActive()) return; // Don't update the coordinates if the user is editing them

	const boardPos = boardpos.getBoardPos();
	const mouseTile = mouse.getTileMouseOver_Integer();

	const xDisplayCoord = mouseTile ? mouseTile[0] : space.roundCoord(boardPos[0]);
	const yDisplayCoord = mouseTile ? mouseTile[1] : space.roundCoord(boardPos[1]);

	// If the number is too big to fit in the input box, display it in exponential notation instead.
	displayBigIntInInput(element_CoordsX, xDisplayCoord, 3);
	displayBigIntInInput(element_CoordsY, yDisplayCoord, 3);
}

/**
 * Formats a BigInt into a string with exponential notation.
 * e.g., formatBigIntExponential(123456789n, 3) => "1.23e8"
 * @param bigint The BigInt to format.
 * @param precision The number of significant digits for the mantissa.
 * @returns The formatted string.
 */
function formatBigIntExponential(bigint: bigint, precision: number): string {
	// Work with the absolute value and track the sign
	const isNegative = bigint < 0n;
	const absString: string = bimath.abs(bigint).toString();

	const exponent: number = absString.length - 1;

	// Get the digits for the mantissa (the part before 'e')
	const mantissaDigits: string = absString.substring(0, precision);

	let mantissa: string;
	if (mantissaDigits.length > 1) {
		// Insert the decimal point, e.g., "123" -> "1.23"
		mantissa = mantissaDigits[0] + '.' + mantissaDigits.substring(1);
	} else {
		// If precision is 1, no decimal point is needed
		mantissa = mantissaDigits;
	}

	// Re-attach the negative sign if needed and combine the parts
	return `${isNegative ? '-' : ''}${mantissa}e${exponent}`;
}

/**
 * Displays a BigInt in an input element. If it overflows,
 * it's displayed in exponential notation instead.
 * @param inputElement The input element to display the number in.
 * @param bigint The BigInt value to display.
 * @param precision The precision for the exponential notation.
 */
function displayBigIntInInput(
	inputElement: HTMLInputElement,
	bigint: bigint,
	precision: number,
): void {
	// First, try to display the full number by setting the .value
	inputElement.value = bigint.toString();

	// Check for overflow.
	if (inputElement.scrollWidth > inputElement.clientWidth + 1) {
		// Needs the +1 due to floating point stuff. Else sometimes at random font sizes this is true when it shouldn't be.
		// Format it and set the .value again.
		inputElement.value = formatBigIntExponential(bigint, precision);
	}
}

/**
 * Parses a string representation (either standard or e-notation) into a BigInt.
 * This is the inverse of {@link formatBigIntExponential}.
 * @param value The string to parse. Can be "12345" or "1.23e8".
 * @returns The resulting BigInt.
 */
function parseStringToBigInt(value: string): bigint {
	const trimmedValue = value.trim();
	if (trimmedValue === '') throw Error();

	// Use case-insensitive check for 'e'
	const eIndex = trimmedValue.toLowerCase().indexOf('e');

	// Case 1: No scientific notation, just a plain integer string.
	if (eIndex === -1) return BigInt(trimmedValue);

	// Case 2: Scientific notation is present.
	const mantissaStr = trimmedValue.substring(0, eIndex);
	const exponentStr = trimmedValue.substring(eIndex + 1);

	if (mantissaStr === '' || exponentStr === '') throw Error(); // Malformed e-notation: missing mantissa or exponent

	const exponent = parseInt(exponentStr, 10);
	// Check if exponent is a valid integer number
	if (isNaN(exponent) || !Number.isInteger(exponent)) throw Error();

	// Since BigInts are whole numbers, a negative exponent would result in a fraction.
	if (exponent < 0) throw Error();

	const isNegative = mantissaStr.startsWith('-');
	const absMantissaStr = isNegative ? mantissaStr.substring(1) : mantissaStr;

	const decimalIndex = absMantissaStr.indexOf('.');
	let allDigits: string;
	let fractionalDigitsCount = 0;

	if (decimalIndex === -1) {
		// e.g., "123e5"
		allDigits = absMantissaStr;
	} else {
		// e.g., "1.23" -> allDigits = "123", fractionalDigitsCount = 2
		const integerPart = absMantissaStr.substring(0, decimalIndex);
		const fractionalPart = absMantissaStr.substring(decimalIndex + 1);

		allDigits = integerPart + fractionalPart;
		fractionalDigitsCount = fractionalPart.length;
	}

	// The number of zeros to append is the exponent minus the number of digits
	// we already have after the decimal point.
	const zerosToAppend = exponent - fractionalDigitsCount;

	const zeros = '0'.repeat(zerosToAppend);
	const finalNumberString = `${isNegative ? '-' : ''}${allDigits}${zeros}`;

	return BigInt(finalNumberString);
}

// =================================================================================

/**
 * Returns true if one of the coordinate fields is active (currently editing)
 */
function isCoordinateActive(): boolean {
	return element_CoordsX === document.activeElement || element_CoordsY === document.activeElement;
}

function initListeners_Navigation(): void {
	element_Recenter.addEventListener('click', recenter);
	element_Expand.addEventListener('click', callback_Expand);
	element_Back.addEventListener('click', callback_Back);
	element_Annotations.addEventListener('click', callback_Annotations);
	element_Erase.addEventListener('click', callback__Collapse);
	element_Collapse.addEventListener('click', callback__Collapse);
	element_pause.addEventListener('click', callback_Pause);

	element_CoordsX.addEventListener('change', callback_CoordsXChange);
	element_CoordsY.addEventListener('change', callback_CoordsYChange);

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

function closeListeners_Navigation(): void {
	element_Recenter.removeEventListener('click', recenter);
	element_Expand.removeEventListener('click', callback_Expand);
	element_Back.removeEventListener('click', callback_Back);
	element_Annotations.removeEventListener('click', callback_Annotations);
	element_Erase.removeEventListener('click', callback__Collapse);
	element_Collapse.removeEventListener('click', callback__Collapse);
	element_Back.removeEventListener('click', callback_Pause);

	element_CoordsX.removeEventListener('change', callback_CoordsXChange);
	element_CoordsY.removeEventListener('change', callback_CoordsYChange);

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

/** Called when the field is FINISHED being edited, not on every keystroke. */
function callback_CoordsXChange(): void {
	element_CoordsX.blur();
	callback_CoordsChange(0);
}

/** Called when the field is FINISHED being edited, not on every keystroke. */
function callback_CoordsYChange(): void {
	element_CoordsY.blur();
	callback_CoordsChange(1);
}

function callback_CoordsChange(index: 0 | 1): void {
	const target: HTMLInputElement = index === 0 ? element_CoordsX : element_CoordsY;

	const boardPos = boardpos.getBoardPos();
	let teleportX: BigDecimal = boardPos[0];
	let teleportY: BigDecimal = boardPos[1];

	let proposed: bigint;
	try {
		proposed = parseStringToBigInt(target.value);
	} catch (_e) {
		console.log(`Entered: ${target.value}`);
		toast.show(translations['coords-invalid'], { error: true });
		return;
	}

	if (bimath.abs(proposed) > TELEPORT_LIMIT) {
		toast.show(translations['coords-exceeded'], { error: true });
		return;
	}

	if (index === 0) teleportX = bd.fromBigInt(proposed);
	else teleportY = bd.fromBigInt(proposed);

	const newPos: BDCoords = [teleportX, teleportY];
	boardpos.setBoardPos(newPos);
}

function callback_Back(): void {
	Transition.undoTransition();
}

function callback_Expand(): void {
	const box: Partial<BoundingBox> =
		boardutil.getBoundingBoxOfAllPieces(gameslot.getGamefile()!.boardsim.pieces) ?? {};

	// Add the square annotation highlights, too.

	// THIS ROUNDS RAY intersections to the nearest integer coordinate, so the resulting area may be imperfect!!!!!
	// I don't think it matters to much.
	const annoteSnapPoints = snapping
		.getAnnoteSnapPoints(false)
		.map((point) => bdcoords.coordsToBigInt(point));

	// Expand the box to include all annote snap points
	for (const snapPoint of annoteSnapPoints) {
		if (box.left === undefined || snapPoint[0] < box.left) box.left = snapPoint[0];
		if (box.right === undefined || snapPoint[0] > box.right) box.right = snapPoint[0];
		if (box.bottom === undefined || snapPoint[1] < box.bottom) box.bottom = snapPoint[1];
		if (box.top === undefined || snapPoint[1] > box.top) box.top = snapPoint[1];
	}

	// If any sides are still undefined, set them to default values
	const definedBox: BoundingBox =
		box.left === undefined ||
		box.right === undefined ||
		box.bottom === undefined ||
		box.top === undefined
			? { left: 1n, right: 8n, bottom: 1n, top: 8n }
			: (box as BoundingBox);

	Transition.zoomToCoordsBox(definedBox);
}

function recenter(): void {
	Transition.zoomToCoordsBox(gameslot.getGamefile()!.boardsim.startSnapshot.box); // If you know the bounding box, you don't need a coordinate list
}

// Annotations Buttons ======================================

function callback_Annotations(): void {
	annotationsEnabled = !annotationsEnabled;
	listener_overlay.setTreatLeftasRight(annotationsEnabled);
	element_Annotations.classList.toggle('enabled');
}

/** Returns whether the annotations button on the navigation bar on mobile devices is enabled (glowing RED) */
function isAnnotationsButtonEnabled(): boolean {
	return annotationsEnabled;
}

function callback__Collapse(): void {
	annotations.Collapse();
}

document.addEventListener('ray-count-change', (e) => {
	const rayCount = e.detail;
	if (rayCount > 0) showCollapse();
	else hideCollapse();
});

/** Replaces eraser svg with collapse svg. */
function showCollapse(): void {
	element_EraseContainer.classList.add('hidden');
	element_CollapseContainer.classList.remove('hidden');
}

/** Replaces collapse svg with eraser svg. */
function hideCollapse(): void {
	element_EraseContainer.classList.remove('hidden');
	element_CollapseContainer.classList.add('hidden');
}

// =====================================================================

/**
 * Returns true if the coords input box is currently not allowed to be edited.
 * This was set at the time they were opened.
 */
function areCoordsAllowedToBeEdited(): boolean {
	return !element_CoordsX.disabled;
}

/** Returns the height of the navigation bar in the document, in virtual pixels. */
function getHeightOfNavBar(): number {
	return element_Navigation.getBoundingClientRect().height;
}

function callback_Pause(): void {
	guipause.open();
}

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
	if (rewindIsLocked) return;
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
	const decrementingLegal = moveutil.isDecrementingLegal(gamefile.boardsim);
	const incrementingLegal = moveutil.isIncrementingLegal(gamefile.boardsim);

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

/**
 * Locks the rewind button for a brief moment. Typically called after forwarding the moves to the front.
 * This is so if our opponent moves while we're rewinding, there's a brief pause.
 */
function lockRewind(): void {
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
function testIfRewindMove(): void {
	if (!listener_document.isKeyDown('ArrowLeft')) return;
	if (rewindIsLocked) return;
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

	if (!moveutil.isDecrementingLegal(gamefile.boardsim)) return stats.showMoves();

	frametracker.onVisualChange();

	movesequence.navigateMove(gamefile, mesh, false);

	selection.unselectPiece();
}

/** Forwards the currently-loaded gamefile by 1 move. Unselects any piece, updates the rewind/forward move buttons. */
function forwardMove(): void {
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	premoves.cancelPremoves(gamefile, mesh);

	if (!moveutil.isIncrementingLegal(gamefile.boardsim)) return stats.showMoves();

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
	if (boardeditor.canUndo()) element_undoEdit.classList.remove('opacity-0_5');
	else element_undoEdit.classList.add('opacity-0_5');

	if (boardeditor.canRedo()) element_redoEdit.classList.remove('opacity-0_5');
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
	boardeditor.undo();
}

/** Redoes one edit. */
function callback_RedoEdit(): void {
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
	callback_Expand,
	lockRewind,
	update,
	isCoordinateActive,
	recenter,
	toggle,
	isAnnotationsButtonEnabled,
	areCoordsAllowedToBeEdited,
	getHeightOfNavBar,
};
