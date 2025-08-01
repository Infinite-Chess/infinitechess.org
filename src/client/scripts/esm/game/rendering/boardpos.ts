
/**
 * This script stores the board position and scale,
 * and updates them according to their velocity.
 */


// @ts-ignore
import guipause from "../gui/guipause.js";
// @ts-ignore
import perspective from "./perspective.js";
// @ts-ignore
import transition from "./transition.js";
// @ts-ignore
import camera from "./camera.js";
// @ts-ignore
import loadbalancer from "../misc/loadbalancer.js";
import frametracker from "./frametracker.js";
import bigdecimal, { BigDecimal } from "../../util/bigdecimal/bigdecimal.js";
import jsutil from "../../util/jsutil.js";


import type { BDCoords, DoubleCoords } from "../../chess/util/coordutil.js";


// BigDecimal Constants ---------------------------------------------------

const ZERO = bigdecimal.FromNumber(0.0);
const ONE = bigdecimal.FromNumber(1.0);

// Variables -------------------------------------------------------------


/**
 * The position of the board in front of the camera.
 * The camera never moves, only the board beneath it.
 * A positon of [0,0] places the [0,0] square in the center of the screen.
 */
let boardPos: BDCoords = bigdecimal.FromCoords([0n,0n]); // Coordinates
/** The current board panning velocity. */
let panVel: DoubleCoords = [0,0];
/**
 * The current board scale (zoom).
 * Higher => zoomed IN
 * Lower => zoomed OUT
 */
let boardScale: BigDecimal = bigdecimal.FromNumber(1.0); // Default: 1.0
/** The current board scale (zoom) velocity. */
let scaleVel: number = 0;


/** The hypotenuse of the x & y pan velocities cannot exceed this value in 2D mode. */
const panVelCap2D = 22.0; // Default: 22
/** The hypotenuse of the x & y pan velocities cannot exceed this value in 3D mode. */
const panVelCap3D = 16.0; // Default: 16

/** The furthest we can be zoomed IN. */
const maximumScale = bigdecimal.FromNumber(5.0); // Default: 5.0
const limitToDampScale = 0.000_01; // We need to soft limit the scale so the game doesn't break


// Getters -------------------------------------------------------


function getBoardPos(): BDCoords {
	return [...boardPos]; // Copies
}

function getBoardScale() {
	return bigdecimal.clone(boardScale);
}

function getPanVel(): DoubleCoords {
	return [...panVel]; // Copies
}

function getRelativePanVelCap() {
	return perspective.getEnabled() ? panVelCap3D : panVelCap2D;
}

function getScaleVel(): number {
	return scaleVel;
}

function glimitToDampScale() {
	return limitToDampScale;
}


// Setters ----------------------------------------------------------------------------------------


function setBoardPos(newPos: BDCoords) {
	boardPos = jsutil.deepCopyObject(newPos); // Copy
	frametracker.onVisualChange();
}

function setBoardScale(newScale: BigDecimal) {
	if (bigdecimal.compare(newScale, ZERO) <= 0) return console.error(`Cannot set scale to ${newScale}!`);

	// Cap the scale
	if (bigdecimal.compare(newScale, maximumScale) > 0) {
		newScale = maximumScale;
		scaleVel = 0; // Cut the scale momentum immediately
	}

	boardScale = newScale;
	frametracker.onVisualChange();
}

function setPanVel(newPanVel: DoubleCoords) {
	if (isNaN(newPanVel[0]) || isNaN(newPanVel[1])) return console.error(`Cannot set panVel to ${newPanVel}!`);

	// Can't enforce a cap, as otherwise we wouldn't
	// be able to throw the board as fast as possible.

	panVel = [...newPanVel];
}

function setScaleVel(newScaleVel: number) {
	if (isNaN(newScaleVel)) return console.error(`Cannot set scaleVel to ${newScaleVel}!`);
	if (Math.abs(newScaleVel) >= 100) console.warn(`Very large scaleVel: (${newScaleVel})`);

	scaleVel = newScaleVel;
}


// Other Utility --------------------------------------------------------


function eraseMomentum() {
	panVel = [0,0];
	scaleVel = 0;
}

function boardHasMomentum() {
	return panVel[0] !== 0 || panVel[1] !== 0;
}

/**
 * We are considered "zoomed out" if every tile is smaller than one virtual pixel.
 * If so, the game has very different behavior, such as:
 * * Legal moves highlights and Ray annotations rendering as highlight lines.
 * * Pieces rendering as mini-images.
 */
function areZoomedOut() {
	return bigdecimal.compare(boardScale, camera.getScaleWhenZoomedOut()) < 0;
}

/**
 * This is true when your device is physically incapable
 * of reprenting single tiles with a single of your monitor's pixels.
 * On retina displays you have to zoom out even more to reach this.
 */
function isScaleSmallForInvisibleTiles() {
	return bigdecimal.compare(boardScale, camera.getScaleWhenTilesInvisible()) < 0;
}


// Updating -------------------------------------------------------------------


// Called from game.updateBoard()
function update() {
	if (guipause.areWePaused()) return; // Exit if paused
	if (transition.areWeTeleporting()) return; // Exit if we are teleporting
	if (loadbalancer.gisAFK()) return; // Exit if we're AFK. Save our CPU!

	panBoard();
	recalcScale();
}

/** Shifts the board position by its velocity. */
function panBoard() {
	if (panVel[0] === 0 && panVel[1] === 0) return; // Exit if we're not moving

	const panVelBD: BDCoords = bigdecimal.FromDoubleCoords(panVel);

	// What the change would be if all frames were the exact same time length.
	const baseXChange = bigdecimal.divide_fixed(panVelBD[0], boardScale);
	const baseYChange = bigdecimal.divide_fixed(panVelBD[1], boardScale);

	// Account for delta time
	const deltaTimeBD: BigDecimal = bigdecimal.FromNumber(loadbalancer.getDeltaTime());
	const actualXChange = bigdecimal.multiply_fixed(baseXChange, deltaTimeBD);
	const actualYChange = bigdecimal.multiply_fixed(baseYChange, deltaTimeBD);

	boardPos[0] = bigdecimal.add(boardPos[0], actualXChange);
	boardPos[1] = bigdecimal.add(boardPos[1], actualYChange);
	frametracker.onVisualChange();
}

/** Shifts the board scale by its scale velocity. */
function recalcScale() {
	if (scaleVel === 0) return; // Exit if we're not zooming

	const scaleVelBD: BigDecimal = bigdecimal.FromNumber(scaleVel);
	const deltaTimeBD: BigDecimal = bigdecimal.FromNumber(loadbalancer.getDeltaTime());

	const product = bigdecimal.multiply_fixed(scaleVelBD, deltaTimeBD); // scaleVel * deltaTime
	const factor2 = bigdecimal.add(product, ONE); // scaleVel * deltaTime + 1

	const newScale = bigdecimal.multiply_fixed(boardScale, factor2); // boardScale * (scaleVel * deltaTime + 1)
	setBoardScale(newScale);
}


// Exports -------------------------------------------------------------------


export default {
	// Getters
	getBoardPos,
	getBoardScale,
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