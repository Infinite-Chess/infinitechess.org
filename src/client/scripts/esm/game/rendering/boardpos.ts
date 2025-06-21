
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


import type { Coords } from "../../chess/util/coordutil.js";


// Variables -------------------------------------------------------------


/**
 * The position of the board in front of the camera.
 * The camera never moves, only the board beneath it.
 * A positon of [0,0] places the [0,0] square in the center of the screen.
 */
let boardPos: Coords = [0,0]; // Coordinates
/** The current board panning velocity. */
let panVel: Coords = [0,0];
/**
 * The current board scale (zoom).
 * Higher => zoomed IN
 * Lower => zoomed OUT
 */
let boardScale: number = 1;
/** The current board scale (zoom) velocity. */
let scaleVel: number = 0;


/** The hypotenuse of the x & y pan velocities cannot exceed this value in 2D mode. */
const panVelCap2D = 22.0; // Default: 22
/** The hypotenuse of the x & y pan velocities cannot exceed this value in 3D mode. */
const panVelCap3D = 16.0; // Default: 16

/** The furthest we can be zoomed IN. */
const maximumScale = 5.0; // Default: 5
const limitToDampScale = 0.000_01; // We need to soft limit the scale so the game doesn't break


// Getters -------------------------------------------------------


function getBoardPos(): Coords {
	return [...boardPos]; // Copies
}

function getBoardScale() {
	return boardScale;
}

function getPanVel(): Coords {
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


function setBoardPos(newPos: Coords) {
	if (isNaN(newPos[0]) || isNaN(newPos[1])) return console.error(`Cannot set boardPos to ${newPos}!`);
	boardPos = [...newPos];
	frametracker.onVisualChange();
}

function setBoardScale(newScale: number) {
	if (isNaN(newScale)) return console.error(`Cannot set scale to ${newScale}!`);
	if (newScale <= 0) return console.error(`Cannot set scale to ${newScale}!`);

	// Cap the scale
	if (newScale > maximumScale) {
		newScale = maximumScale;
		scaleVel = 0; // Cut the scale momentum immediately
	}

	boardScale = newScale;
	frametracker.onVisualChange();
}

function setPanVel(newPanVel: Coords) {
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
	return boardScale < camera.getScaleWhenZoomedOut();
}

/**
 * This is true when your device is physically incapable
 * of reprenting single tiles with a single of your monitor's pixels.
 * On retina displays you have to zoom out even more to reach this.
 */
function isScaleSmallForInvisibleTiles() {
	return boardScale < camera.getScaleWhenTilesInvisible();
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
	boardPos[0] += loadbalancer.getDeltaTime() * panVel[0] / boardScale;
	boardPos[1] += loadbalancer.getDeltaTime() * panVel[1] / boardScale;
	frametracker.onVisualChange();
}

/** Shifts the board scale by its scale velocity. */
function recalcScale() {
	if (scaleVel === 0) return; // Exit if we're not zooming

	// Dampen the scale change to create a soft zoom limit
	// to prevent players from breaking a game too fast.
	const damp = scaleVel > 0 || boardScale > limitToDampScale ? 1 : boardScale / limitToDampScale;

	const newScale = boardScale * (1 + loadbalancer.getDeltaTime() * scaleVel * damp);
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