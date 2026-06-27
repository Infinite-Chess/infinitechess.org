// src/client/scripts/esm/game/gui/guiboardcontrols.ts

/**
 * This script handles the buttons and coordinate fields within the
 * `.board-controls` element on the game page: view toggles (perspective,
 * arrow indicators), annotation tools (draw, erase/collapse — mobile only),
 * board-view navigation (undo transition, expand, recenter), and the
 * editable coordinate readout.
 */

import type { BDCoords } from '../../../../../shared/chess/util/coordutil.js';
import type { BoundingBox } from '../../../../../shared/util/math/bounds.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import bimath from '../../../../../shared/util/math/bimath.js';
import bdcoords from '../../../../../shared/chess/util/bdcoords.js';
import boardutil from '../../../../../shared/chess/util/boardutil.js';

import toast from '../../components/toast.js';
import mouse from '../../util/mouse.js';
import space from '../misc/space.js';
import arrows from '../rendering/arrows/arrows.js';
import gameslot from '../chess/gameslot.js';
import boardpos from '../rendering/boardpos.js';
import snapping from '../rendering/highlights/snapping.js';
import { Mouse } from '../input.js';
import Transition from '../rendering/transitions/Transition.js';
import perspective from '../rendering/perspective.js';
import annotations from '../rendering/highlights/annotations/annotations.js';
import { listener_document, listener_overlay } from '../chess/game.js';

// Elements ----------------------------------------------------------------------------------

// View toggles
const element_Perspective = document.getElementById('btn-perspective')!;
const element_Arrows = document.getElementById('btn-arrows')!;
/** The arrow-indicator <use> glyphs, ordered to match {@link arrows.getMode}: [off, defense, all, hippogonals]. */
const element_ArrowUses = element_Arrows.querySelectorAll<SVGUseElement>('use');

// Annotation tools (mobile only)
const element_Annotations = document.getElementById('btn-annotations')!;
const element_Erase = document.getElementById('btn-erase')!;
const element_Collapse = document.getElementById('btn-collapse')!;

// Board-view navigation
const element_Back = document.getElementById('btn-board-back')!;
const element_Expand = document.getElementById('btn-board-expand')!;
const element_Recenter = document.getElementById('btn-board-recenter')!;

// Coordinate readout
const element_CoordsX = document.getElementById('coord-x') as HTMLInputElement;
const element_CoordsY = document.getElementById('coord-y') as HTMLInputElement;

// Tooltip shown on the arrows button for each mode, indexed by {@link arrows.getMode}. */
const ARROW_TOOLTIPS: { [mode in 0 | 1 | 2 | 3]: string } = {
	0: 'Arrow indicators: Off',
	1: 'Arrow indicators: Defense',
	2: 'Arrow indicators: All',
	3: 'Arrow indicators: All + Hippogonals',
};

// Variables ---------------------------------------------------------------------------------

/**
 * Whether the annotations button is enabled.
 * If so, all left click actions are treated as right clicks.
 */
let annotationsEnabled: boolean = false;

// Events ------------------------------------------------------------------------------------

document.addEventListener('ray-count-change', (e) => {
	const rayCount = e.detail;
	if (rayCount > 0) showCollapse();
	else hideCollapse();
});

// =============================== View Toggles ===============================

/** Toggles perspective view, glowing the button while it's enabled. */
function callback_Perspective(): void {
	if (!gameslot.getGamefile()) return; // Game not loaded yet
	// Prevent the sidebar click that toggled perspective
	// from being instantly absorbed by game interactions.
	// Without this, any mini image underneath the crosshair instantly gets clicked.
	listener_document.claimMouseClick(Mouse.LEFT);
	perspective.toggle();
	element_Perspective.classList.toggle('enabled', perspective.getEnabled());
}

/** Cycles the arrow-indicators mode, then syncs the button's glyph + tooltip. */
function callback_Arrows(): void {
	if (!gameslot.getGamefile()) return; // Game not loaded yet
	arrows.toggleArrows();
	update_ArrowsButton();
}

/** Reveals the glyph + tooltip matching the active arrow-indicators mode. */
function update_ArrowsButton(): void {
	const mode = arrows.getMode();
	element_ArrowUses.forEach((use, i) => use.classList.toggle('hidden', i !== mode));
	element_Arrows.setAttribute('data-tooltip', ARROW_TOOLTIPS[mode]);
}

// =============================== Annotation Tools ===============================

function callback_Annotations(): void {
	annotationsEnabled = !annotationsEnabled;
	listener_overlay.setTreatLeftasRight(annotationsEnabled);
	element_Annotations.classList.toggle('enabled');
}

/** Returns whether the annotations button on mobile devices is enabled (glowing). */
function isAnnotationsButtonEnabled(): boolean {
	return annotationsEnabled;
}

function callback_Collapse(): void {
	annotations.Collapse();
}

/** Replaces the erase button with the collapse button. */
function showCollapse(): void {
	element_Erase.classList.add('hidden');
	element_Collapse.classList.remove('hidden');
}

/** Replaces the collapse button with the erase button. */
function hideCollapse(): void {
	element_Erase.classList.remove('hidden');
	element_Collapse.classList.add('hidden');
}

// =============================== Board-View Navigation ===============================

function callback_Back(): void {
	Transition.undoTransition();
}

function callback_Expand(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return; // Game not loaded yet

	const box: Partial<BoundingBox> = boardutil.getBoundingBoxOfAllPieces(gamefile.pieces) ?? {};

	// Add the square annotation highlights, too.

	// THIS ROUNDS RAY intersections to the nearest integer coordinate, so the resulting area may be imperfect!!!!!
	// I don't think it matters too much.
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

function callback_Recenter(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return; // Game not loaded yet
	Transition.zoomToCoordsBox(gamefile.startSnapshot.box); // If you know the bounding box, you don't need a coordinate list
}

// =============================== Coordinate Fields ===============================

// Update the division on the screen displaying your current coordinates
function updateCoords(): void {
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
	const digitCount = bimath.countDigits(bigint);
	// countDigits() is sometimes off by 1. If it estimates the digit count is within bounds,
	// verify exactly to be sure. This also ensures the negative sign is accounted for too.
	const overflows = digitCount > 13 || bigint.toString().length > 12;

	if (overflows) inputElement.value = bimath.formatBigIntExponential(bigint, precision);
	else inputElement.value = bigint.toString();
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

/** Returns true if one of the coordinate fields is active (currently editing). */
function isCoordinateActive(): boolean {
	return element_CoordsX === document.activeElement || element_CoordsY === document.activeElement;
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
		toast.show(
			'Invalid coordinate format. Please enter integers or e-notation (e.g., 1.23e4).',
			{ error: true },
		);
		return;
	}

	// TODO: Implement dynamic teleport limit based on the furthest the user has ever been.
	// WHEN we do that, we can then delete gameconfig.TELEPORT_LIMIT.
	// if (bimath.abs(proposed) > gameconfig.TELEPORT_LIMIT) {
	// 	toast.show("You can't teleport that far! That would be too easy ;)", { error: true });
	// 	return;
	// }

	if (index === 0) teleportX = bd.fromBigInt(proposed);
	else teleportY = bd.fromBigInt(proposed);

	const newPos: BDCoords = [teleportX, teleportY];
	boardpos.setBoardPos(newPos);
}

// =================================================================================

/** Wires the click/change listeners for every `.board-controls` element. */
function initListeners(): void {
	element_Perspective.addEventListener('click', callback_Perspective);
	element_Arrows.addEventListener('click', callback_Arrows);

	element_Annotations.addEventListener('click', callback_Annotations);
	element_Erase.addEventListener('click', callback_Collapse);
	element_Collapse.addEventListener('click', callback_Collapse);

	element_Back.addEventListener('click', callback_Back);
	element_Expand.addEventListener('click', callback_Expand);
	element_Recenter.addEventListener('click', callback_Recenter);

	element_CoordsX.addEventListener('change', callback_CoordsXChange);
	element_CoordsY.addEventListener('change', callback_CoordsYChange);
}

initListeners();

export default {
	updateCoords,
	callback_Arrows,
	isAnnotationsButtonEnabled,
	callback_Expand,
};
