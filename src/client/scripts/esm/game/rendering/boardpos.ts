
/**
 * This script stores the board position and scale,
 * and updates them according to their velocity.
 */


// @ts-ignore
import guipause from "../gui/guipause.js";
// @ts-ignore
import loadbalancer from "../misc/loadbalancer.js";
import camera from "./camera.js";
import perspective from "./perspective.js";
import Transition from "./transitions/Transition.js";
import frametracker from "./frametracker.js";
import jsutil from "../../../../../shared/util/jsutil.js";
import coordutil from "../../../../../shared/chess/util/coordutil.js";
import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";


import type { BDCoords, DoubleCoords } from "../../../../../shared/chess/util/coordutil.js";


// BigDecimal Constants ---------------------------------------------------

const ZERO = bd.FromBigInt(0n);
const ONE = bd.FromBigInt(1n);

// Variables -------------------------------------------------------------


/**
 * The position of the board in front of the camera.
 * The camera never moves, only the board beneath it.
 * A positon of [0,0] places the [0,0] square in the center of the screen.
 */
let boardPos: BDCoords = bd.FromCoords([0n,0n]); // Coordinates
/** The current board panning velocity. */
let panVel: DoubleCoords = [0,0];
/**
 * The current board scale (zoom).
 * Higher => zoomed IN
 * Lower => zoomed OUT
 */
let boardScale: BigDecimal = bd.FromBigInt(1n); // Default: 1
/** The current board scale (zoom) velocity. */
let scaleVel: number = 0;


/** The hypotenuse of the x & y pan velocities cannot exceed this value in 2D mode. */
const panVelCap2D = 22.0; // Default: 22
/** The hypotenuse of the x & y pan velocities cannot exceed this value in 3D mode. */
const panVelCap3D = 16.0; // Default: 16

/** The furthest we can be zoomed IN. */
const maximumScale = bd.FromBigInt(5n); // Default: 5.0
const limitToDampScale = 0.000_01; // We need to soft limit the scale so the game doesn't break


// Getters -------------------------------------------------------


function getBoardPos(): BDCoords {
	return coordutil.copyBDCoords(boardPos);
}

function getBoardScale(): BigDecimal {
	return bd.clone(boardScale);
}

/**
 * Call when you are CONFIDENT we are zoomed in enough that our scale
 * can be represented as a javascript number without overflowing to
 * Infinity or underflowing to 0.
 * 
 * Typically used for graphics calculations, as the arithmetic
 * is faster than using BigDecimals.
 */
function getBoardScaleAsNumber(): number {
	return bd.toNumber(boardScale);
}

function getPanVel(): DoubleCoords {
	return [...panVel]; // Copies
}

function getRelativePanVelCap(): number {
	return perspective.getEnabled() ? panVelCap3D : panVelCap2D;
}

function getScaleVel(): number {
	return scaleVel;
}

function glimitToDampScale(): number {
	return limitToDampScale;
}


// Setters ----------------------------------------------------------------------------------------


function setBoardPos(newPos: BDCoords): void {
	// Enforce fixed point model. Catches bugs during development.
	if (!bd.hasDefaultPrecision(newPos[0])) throw Error(`Cannot set board position X to [${newPos[0].divex}] ${bd.toString(newPos[0])}. Does not have default precision.`);
	if (!bd.hasDefaultPrecision(newPos[1])) throw Error(`Cannot set board position Y to [${newPos[1].divex}] ${bd.toString(newPos[1])}. Does not have default precision.`);

	// console.log(`New board position [${(boardPos[0].divex)},${boardPos[1].divex}]`, coordutil.stringifyBDCoords(boardPos));
	boardPos = jsutil.deepCopyObject(newPos); // Copy
	frametracker.onVisualChange();
}

function setBoardScale(newScale: BigDecimal): void {
	if (bd.compare(newScale, ZERO) <= 0) return console.error(`Cannot set scale to a negative: ${bd.toString(newScale)}`);
	// console.error("New scale:", bd.toString(newScale));

	// Cap the scale
	if (bd.compare(newScale, maximumScale) > 0) {
		newScale = maximumScale;
		scaleVel = 0; // Cut the scale momentum immediately
	}

	boardScale = newScale;
	frametracker.onVisualChange();
}

function setPanVel(newPanVel: DoubleCoords): void {
	if (isNaN(newPanVel[0]) || isNaN(newPanVel[1])) return console.error(`Cannot set panVel to ${newPanVel}!`);

	// Can't enforce a cap, as otherwise we wouldn't
	// be able to throw the board as fast as possible.

	panVel = [...newPanVel];
}

function setScaleVel(newScaleVel: number): void {
	if (isNaN(newScaleVel)) return console.error(`Cannot set scaleVel to ${newScaleVel}!`);
	if (Math.abs(newScaleVel) >= 100) console.warn(`Very large scaleVel: (${newScaleVel})`);

	scaleVel = newScaleVel;
}


// Other Utility --------------------------------------------------------


/** Erases all board pan & scale velocity. */
function eraseMomentum(): void {
	panVel = [0,0];
	scaleVel = 0;
}

function boardHasMomentum(): boolean {
	return panVel[0] !== 0 || panVel[1] !== 0;
}

/**
 * We are considered "zoomed out" if every tile is smaller than one virtual pixel.
 * If so, the game has very different behavior, such as:
 * * Legal moves highlights and Ray annotations rendering as highlight lines.
 * * Pieces rendering as mini-images.
 */
function areZoomedOut(): boolean {
	return bd.compare(boardScale, camera.getScaleWhenZoomedOut()) < 0;
}

/**
 * This is true when your device is physically incapable
 * of reprenting single tiles with a single of your monitor's pixels.
 * On retina displays you have to zoom out even more to reach this.
 */
function isScaleSmallForInvisibleTiles(): boolean {
	return bd.compare(boardScale, camera.getScaleWhenTilesInvisible()) < 0;
}


// Updating -------------------------------------------------------------------


// Called from game.updateBoard()
function update(): void {
	if (guipause.areWePaused()) return; // Exit if paused
	if (Transition.areTransitioning()) return; // Exit if we are teleporting
	if (loadbalancer.gisAFK()) return; // Exit if we're AFK. Save our CPU!

	panBoard();
	recalcScale();
}

/** Shifts the board position by its velocity. */
function panBoard(): void {
	if (panVel[0] === 0 && panVel[1] === 0) return; // Exit if we're not moving

	const panVelBD: BDCoords = bd.FromDoubleCoords(panVel);

	// What the change would be if all frames were the exact same time length.
	const baseXChange = bd.divide_fixed(panVelBD[0], boardScale);
	const baseYChange = bd.divide_fixed(panVelBD[1], boardScale);

	// Account for delta time
	const deltaTimeBD: BigDecimal = bd.FromNumber(loadbalancer.getDeltaTime());
	const actualXChange = bd.multiply_fixed(baseXChange, deltaTimeBD);
	const actualYChange = bd.multiply_fixed(baseYChange, deltaTimeBD);

	const newPos: BDCoords = [
		bd.add(boardPos[0], actualXChange),
		bd.add(boardPos[1], actualYChange)
	];
	setBoardPos(newPos);
}

/** Shifts the board scale by its scale velocity. */
function recalcScale(): void {
	if (scaleVel === 0) return; // Exit if we're not zooming

	const scaleVelBD: BigDecimal = bd.FromNumber(scaleVel);
	const deltaTimeBD: BigDecimal = bd.FromNumber(loadbalancer.getDeltaTime());

	const product = bd.multiply_fixed(scaleVelBD, deltaTimeBD); // scaleVel * deltaTime
	const factor2 = bd.add(product, ONE); // scaleVel * deltaTime + 1

	const newScale = bd.multiply_floating(boardScale, factor2); // boardScale * (scaleVel * deltaTime + 1)
	setBoardScale(newScale);
}


// Exports -------------------------------------------------------------------


export default {
	// Getters
	getBoardPos,
	getBoardScale,
	getBoardScaleAsNumber,
	getPanVel,
	getRelativePanVelCap,
	getScaleVel,
	glimitToDampScale,
	// Setters
	setBoardPos,
	setBoardScale,
	setPanVel,
	setScaleVel,
	// Other Utility
	eraseMomentum,
	boardHasMomentum,
	areZoomedOut,
	isScaleSmallForInvisibleTiles,
	// Updating
	update,
};