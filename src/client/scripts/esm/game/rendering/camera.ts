
// src/client/scripts/esm/game/rendering/camera.ts

/**
 * This script handles and stores the matrixes of our shader programs, which
 * store the location of the camera, and contains data about our canvas and window.
 * Note that our camera is going to be at a FIXED location no matter what our board
 * location is or our scale is, the camera remains still while the board moves beneath us.
 * 
 * viewMatrix  is the camera location and rotation.
 * projMatrix  needed for perspective mode rendering (is even enabled in 2D view).
 * worldMatrix  is custom for each rendered object, translating it how desired.
 */


// @ts-ignore
import statustext from '../gui/statustext.js';
// @ts-ignore
import stats from '../gui/stats.js';
// @ts-ignore
import mat4 from './gl-matrix.js';
import perspective from './perspective.js';
import guidrawoffer from '../gui/guidrawoffer.js';
import jsutil from '../../util/jsutil.js';
import frametracker from './frametracker.js';
import preferences from '../../components/header/preferences.js';
import guigameinfo from '../gui/guigameinfo.js';
import { gl } from './webgl.js';
import bigdecimal, { BigDecimal } from '../../util/bigdecimal/bigdecimal.js';


import type { DoubleBoundingBox } from '../../util/math/bounds.js';
import type { Vec3 } from '../../util/math/vectors.js';



/** A 4x4 matrix, represented as a 16-element Float32Array */
type Mat4 = Float32Array;



/** If true, the camera is stationed farther back. */
let DEBUG: boolean = false;

// This will NEVER change! The camera stays while the board position is what moves!
// What CAN change is the rotation of the view matrix!
const position: Vec3 = [0, 0, 12]; // [x, y, z]
const position_devMode: Vec3 = [0, 0, 18]; // Default: 18

/** Field of view, in radians */
let fieldOfView: number;
// The closer near & far limits are in terms of orders of magnitude, the more accurate
// and less often things appear out of order. Should be within 5-6 magnitude orders.
const zNear: number = 1;
const zFar: number = 1500 * Math.SQRT2; // Default 1500. Has to atleast be  perspective.distToRenderBoard * sqrt(2)

/** The canvas document element that WebGL renders the game onto. */
const canvas: HTMLCanvasElement = document.getElementById('game') as HTMLCanvasElement;
let canvasWidthVirtualPixels: number;
let canvasHeightVirtualPixels: number;
let aspect: number; // Aspect ratio of the canvas width to height.

/**
 * The location in world-space of the edges of the screen.
 * SMALL NUMBERS. Not affected by position or scale (zoom).
 * So we don't need to use BigDecimals.
 */
let screenBoundingBox: DoubleBoundingBox;
/**
 * The location in world-space of the edges of the screen, when in developer mode.
 * SMALL NUMBERS. Not affected by position or scale (zoom).
 * So we don't need to use BigDecimals.
 */
let screenBoundingBox_devMode: DoubleBoundingBox;

/** Contains the matrix for transforming our camera to look like it's in perspective.
 * This ONLY needs to update on the gpu whenever the screen size changes. */
let projMatrix: Mat4; // Same for every shader program

/** Contains the camera's position and rotation, updated once per frame on the gpu.
 * 
 * When compared to the world matrix, that uniform is updated with every draw call,
 * because it specifies the translation and rotation of the bound mesh. */
let viewMatrix: Mat4;

// Returns devMode-sensitive camera position.
function getPosition(ignoreDevmode?: boolean): Vec3 {
	return jsutil.deepCopyObject(!ignoreDevmode && DEBUG ? position_devMode : position);
}

function getZFar(): number {
	return zFar;
}

function getCanvasWidthVirtualPixels(): number {
	return canvasWidthVirtualPixels;
}

function getCanvasHeightVirtualPixels(): number {
	return canvasHeightVirtualPixels;
}

function toggleDebug(): void {
	DEBUG = !DEBUG;
	frametracker.onVisualChange(); // Visual change, render the screen this frame
	onPositionChange();
	perspective.initCrosshairModel();
	statustext.showStatus(`Toggled camera debug: ${DEBUG}`);
}

function getDebug(): boolean {
	return DEBUG;
}

/**
 * Returns a copy of the current screen bounding box,
 * or the world-space coordinates of the edges of the canvas.
 * @param [debugMode] Whether developer mode is enabled. If omitted, the current debug status is used.
 * @returns The bounding box of the screen
 */
function getScreenBoundingBox(debugMode: boolean = DEBUG): DoubleBoundingBox {
	return jsutil.deepCopyObject(debugMode ? screenBoundingBox_devMode : screenBoundingBox);
}

/**
 * Returns the length from the bottom of the screen to the top, in tiles when at a zoom of 1.
 * This is the same as the height of {@link getScreenBoundingBox}.
 * @param [debugMode] Whether developer mode is enabled. If omitted, the current debug status is used.
 * @returns The height of the screen in squares
 */
function getScreenHeightWorld(debugMode: boolean = DEBUG): number {
	const boundingBox = getScreenBoundingBox(debugMode);
	return boundingBox.top - boundingBox.bottom;
}

/**
 * Returns a copy of the current view matrix.
 * @returns The view matrix
 */
function getViewMatrix(): Mat4 {
	return jsutil.copyFloat32Array(viewMatrix);
}

/**
 * Returns a copy of both the projMatrix and viewMatrix
 */
function getProjAndViewMatrixes(): { projMatrix: Mat4; viewMatrix: Mat4 } {
	return {
		projMatrix: jsutil.copyFloat32Array(projMatrix),
		viewMatrix: jsutil.copyFloat32Array(viewMatrix)
	};
}

// Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), worldMatrix (world translation)
function init(): void {
	initFOV();
	initMatrixes();
	window.addEventListener("resize", onScreenResize);
	document.addEventListener("fov-change", onFOVChange as EventListener); // Custom Event
}

// Inits the matrix uniforms: viewMatrix (camera) & projMatrix
function initMatrixes(): void {
    
	projMatrix = mat4.create(); // Same for every shader program

	updateCanvasDimensions();
	initPerspective(); // Initiates perspective, including the projection matrix

	initViewMatrix(); // Camera

	// World matrix only needs to be initiated when rendering objects
}

// Call this when window resized. Also updates the projection matrix.
function initPerspective(): void {
	initProjMatrix();
}

// Also updates viewport, and updates canvas-dependant variables
function updateCanvasDimensions(): void {
	// Get the canvas element's bounding rectangle
	const rect = canvas.getBoundingClientRect();
	canvasWidthVirtualPixels = rect.width;
	canvasHeightVirtualPixels = rect.height;

	// Size of entire window in physical pixels, not virtual. Retina displays have a greater width.
	canvas.width = canvasWidthVirtualPixels * window.devicePixelRatio; 
	canvas.height = canvasHeightVirtualPixels * window.devicePixelRatio;

	gl.viewport(0, 0, canvas.width, canvas.height);

	recalcCanvasVariables(); // Recalculate canvas-dependant variables
}

function recalcCanvasVariables(): void {
	aspect = (gl.canvas as HTMLCanvasElement).clientWidth / (gl.canvas as HTMLCanvasElement).clientHeight;
	initScreenBoundingBox();
}

// Set view matrix
function setViewMatrix(newMatrix: Mat4): void {
	viewMatrix = newMatrix;
}

// Initiates the camera matrix. View matrix.
function initViewMatrix(ignoreRotations?: boolean): void {
	const newViewMatrix: Mat4 = mat4.create();

	const cameraPos = getPosition(); // devMode-sensitive

	// Translates the view (camera) matrix to be looking at point..
	//             Camera,     Position, Looking-at, Up-direction
	mat4.lookAt(newViewMatrix, cameraPos, [0, 0, 0], [0, 1, 0]);

	if (!ignoreRotations) perspective.applyRotations(newViewMatrix);

	viewMatrix = newViewMatrix;

	// We NO LONGER send the updated matrix to the shaders as a uniform anymore,
	// because the combined transformMatrix is recalculated on every draw call.
}

/** Inits the projection matrix uniform and sends that over to the gpu for each of our shader programs. */
function initProjMatrix(): void {
	mat4.perspective(projMatrix, fieldOfView, aspect, zNear, zFar);
	// We NO LONGER send the updated matrix to the shaders as a uniform anymore,
	// because the combined transformMatrix is recalculated on every draw call.
	frametracker.onVisualChange();
}

// Return the world-space x & y positions of the screen edges. Not affected by scale or board position.
function initScreenBoundingBox(): void {

	// Camera dist
	let dist = position[2];
	// const dist = 7;
	const thetaY = fieldOfView / 2; // Radians

	// Length of missing side:
	// tan(theta) = x / dist
	// x = tan(theta) * dist
	let distToVertEdge = Math.tan(thetaY) * dist;
	let distToHorzEdge = distToVertEdge * aspect;

	screenBoundingBox = {
		left: -distToHorzEdge,
		right: distToHorzEdge,
		bottom: -distToVertEdge,
		top: distToVertEdge
	};

	// Now init the developer-mode screen bounding box

	dist = position_devMode[2];

	distToVertEdge = Math.tan(thetaY) * dist;
	distToHorzEdge = distToVertEdge * aspect;

	screenBoundingBox_devMode = {
		left: -distToHorzEdge,
		right: distToHorzEdge,
		bottom: -distToVertEdge,
		top: distToVertEdge
	};
}

function onScreenResize(): void {
	updateCanvasDimensions(); // Also updates viewport
	stats.updateStatsCSS();
	initPerspective(); // The projection matrix needs to be recalculated every screen resize
	perspective.initCrosshairModel();
	frametracker.onVisualChange(); // Visual change. Render the screen this frame.
	guidrawoffer.updateVisibilityOfNamesAndClocksWithDrawOffer(); // Hide the names and clocks depending on if the draw offer UI is cramped
	guigameinfo.updateAlignmentUsernames();
	// console.log('Resized window.')
}

// Converts to radians
function initFOV(): void {
	fieldOfView = preferences.getPerspectiveFOV() * Math.PI / 180;
}

function onFOVChange(): void {
	// console.log("Detected field of view change custom event!");
	initFOV();
	initProjMatrix();
	recalcCanvasVariables(); // The only thing inside here we don't actually need to change is the aspect variable, but it doesn't matter.
	perspective.initCrosshairModel();
}

// Call both when camera moves or rotates
function onPositionChange(): void {
	initViewMatrix();
}

/**
 * Returns the scale at which 1 physical pixel on the screen equals 1 tile. 
 */
function getScaleWhenTilesInvisible(): BigDecimal {
	// We can cast this to a BigDecimal last because we know the resulting scale isn't arbitrarily small.
	return bigdecimal.FromNumber((screenBoundingBox.right * 2) / canvas.width);
}

/** 
 * Returns the scale at which the game is considered *zoomed out*.
 * Each tile equals 1 virtual pixel on the screen.
 */
function getScaleWhenZoomedOut(): BigDecimal {
	const WDPR_BD = bigdecimal.FromNumber(window.devicePixelRatio);
	return bigdecimal.multiply_fixed(getScaleWhenTilesInvisible(), WDPR_BD);
}



export type {
	Mat4,
};

export default {
	getPosition,
	canvas,
	getCanvasWidthVirtualPixels,
	getCanvasHeightVirtualPixels,
	toggleDebug,
	getDebug,
	getScreenBoundingBox,
	getScreenHeightWorld,
	getViewMatrix,
	setViewMatrix,
	getProjAndViewMatrixes,
	init,
	onPositionChange,
	initViewMatrix,
	getZFar,
	getScaleWhenTilesInvisible,
	getScaleWhenZoomedOut,
};