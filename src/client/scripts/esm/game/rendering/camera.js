
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

// Import Start
import perspective from './perspective.js';
import miniimage from './miniimage.js';
import stats from '../gui/stats.js';
import mat4 from './gl-matrix.js';
import { gl } from './webgl.js';
import guidrawoffer from '../gui/guidrawoffer.js';
import jsutil from '../../util/jsutil.js';
import frametracker from './frametracker.js';
import preferences from '../../components/header/preferences.js';
import movement from './movement.js';
import statustext from '../gui/statustext.js';
import piecesmodel from './piecesmodel.js';
import gameslot from '../chess/gameslot.js';
import options from './options.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('../../util/math.js').BoundingBox} BoundingBox
 */

"use strict";

/** If true, the camera is stationed farther back. */
let DEBUG = false;

// This will NEVER change! The camera stays while the board position is what moves!
// What CAN change is the rotation of the view matrix!
const position = [0, 0, 12]; // [x, y, z]
const position_devMode = [0, 0, 18];

/** Field of view, in radians */
let fieldOfView;
// The closer near & far limits are in terms of orders of magnitude, the more accurate
// and less often things appear out of order. Should be within 5-6 magnitude orders.
const zNear = 1;
const zFar = 1500 * Math.SQRT2; // Default 1500. Has to atleast be  perspective.distToRenderBoard * sqrt(2)

/** The canvas document element that WebGL renders the game onto. @type {HTMLCanvasElement} */
const canvas = document.getElementById('game');
let canvasWidthVirtualPixels;
let canvasHeightVirtualPixels;
let canvasRect; // accessed by mouse move listener in input script
let aspect; // Aspect ratio of the canvas width to height.

/**
 * The location in world-space of the edges of the screen.
 * Not affected by position or scale (zoom).
 * @type {BoundingBox}
 */
let screenBoundingBox;
/**
 * The location in world-space of the edges of the screen, when in developer mode.
 * Not affected by position or scale (zoom).
 * @type {BoundingBox}
 */
let screenBoundingBox_devMode;

/** Contains the matrix for transforming our camera to look like it's in perspective.
 * This ONLY needs to update on the gpu whenever the screen size changes. */
let projMatrix; // Same for every shader program

/** Contains the camera's position and rotation, updated once per frame on the gpu.
 * 
 * When compared to the world matrix, that uniform is updated with every draw call,
 * because it specifies the translation and rotation of the bound mesh. */
let viewMatrix;

// Returns devMode-sensitive camera position.
function getPosition(ignoreDevmode) {
	return jsutil.deepCopyObject(!ignoreDevmode && DEBUG ? position_devMode : position);
}

function getZFar() {
	return zFar;
}

function getCanvasWidthVirtualPixels() {
	return canvasWidthVirtualPixels;
}

function getCanvasHeightVirtualPixels() {
	return canvasHeightVirtualPixels;
}

function getCanvasRect() {
	return jsutil.deepCopyObject(canvasRect);
}

function toggleDebug() {
	DEBUG = !DEBUG;
	frametracker.onVisualChange(); // Visual change, render the screen this frame
	onPositionChange();
	perspective.initCrosshairModel();
	piecesmodel.regenModel(gameslot.getGamefile(), options.getPieceRegenColorArgs()); // This will regenerate the voids model as wireframe
	statustext.showStatus(`Toggled camera debug: ${DEBUG}`);
}

function getDebug() {
	return DEBUG;
}

// Returns the bounding box of the screen in world-space, NOT tile/board space.

/**
 * Returns a copy of the current screen bounding box,
 * or the world-space coordinates of the edges of the canvas.
 * @param {boolean} [debugMode] Whether developer mode is enabled.
 * @returns {BoundingBox} The bounding box of the screen
 */
function getScreenBoundingBox(debugMode = DEBUG) {
	return jsutil.deepCopyObject(debugMode ? screenBoundingBox_devMode : screenBoundingBox);
}

/**
 * Returns the length from the bottom of the screen to the top, in tiles when at a zoom of 1.
 * This is the same as the height of {@link getScreenBoundingBox}.
 * @param {boolean} [debugMode] Whether developer mode is enabled.
 * @returns {number} The height of the screen in squares
 */
function getScreenHeightWorld(debugMode = DEBUG) {
	const boundingBox = getScreenBoundingBox(debugMode);
	return boundingBox.top - boundingBox.bottom;
}

/**
 * Returns a copy of the current view matrix.
 * @returns {Float32Array} The view matrix
 */
function getViewMatrix() {
	return jsutil.copyFloat32Array(viewMatrix);
}

/**
 * Returns a copy of both the projMatrix and viewMatrix
 */
function getProjAndViewMatrixes() {
	return {
		projMatrix: jsutil.copyFloat32Array(projMatrix),
		viewMatrix: jsutil.copyFloat32Array(viewMatrix)
	};
}

// Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), worldMatrix (world translation)
function init() {
	initFOV();
	initMatrixes();
	canvasRect = canvas.getBoundingClientRect();
	window.addEventListener("resize", onScreenResize);
	document.addEventListener("fov-change", onFOVChange); // Custom Event
}

// Inits the matrix uniforms: viewMatrix (camera) & projMatrix
function initMatrixes() {
    
	projMatrix = mat4.create(); // Same for every shader program

	updateCanvasDimensions();
	initPerspective(); // Initiates perspective, including the projection matrix

	initViewMatrix(); // Camera

	// World matrix only needs to be initiated when rendering objects
}

// Call this when window resized. Also updates the projection matrix.
function initPerspective() {
	initProjMatrix();
}

// Also updates viewport, and updates canvas-dependant variables
function updateCanvasDimensions() {
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

function recalcCanvasVariables() {
	aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	initScreenBoundingBox();

	// Recalculate scale at which 1 tile = 1 pixel       world-space                physical pixels
	movement.setScale_When1TileIs1Pixel_Physical((screenBoundingBox.right * 2) / canvas.width);
	movement.setScale_When1TileIs1Pixel_Virtual(movement.getScale_When1TileIs1Pixel_Physical() * window.devicePixelRatio);
	// console.log(`Screen width: ${camera.getScreenBoundingBox(false).right * 2}. Canvas width: ${camera.canvas.width}`)

	miniimage.recalcWidthWorld();
}

// Set view matrix
function setViewMatrix(newMatrix) {
	viewMatrix = newMatrix;
}

// Initiates the camera matrix. View matrix.
function initViewMatrix(ignoreRotations) {
	const newViewMatrix = mat4.create();

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
function initProjMatrix() {
	mat4.perspective(projMatrix, fieldOfView, aspect, zNear, zFar);
	// We NO LONGER send the updated matrix to the shaders as a uniform anymore,
	// because the combined transformMatrix is recalculated on every draw call.
	frametracker.onVisualChange();
}

// Return the world-space x & y positions of the screen edges. Not affected by scale or board position.
function initScreenBoundingBox() {

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

function onScreenResize() {
	updateCanvasDimensions(); // Also updates viewport
	stats.updateStatsCSS();
	initPerspective(); // The projection matrix needs to be recalculated every screen resize
	perspective.initCrosshairModel();
	frametracker.onVisualChange(); // Visual change. Render the screen this frame.
	guidrawoffer.updateVisibilityOfNamesAndClocksWithDrawOffer(); // Hide the names and clocks depending on if the draw offer UI is cramped
	// console.log('Resized window.')
}

// Converts to radians
function initFOV() {
	fieldOfView = preferences.getPerspectiveFOV() * Math.PI / 180;
}

function onFOVChange() {
	// console.log("Detected field of view change custom event!");
	initFOV();
	initProjMatrix();
	recalcCanvasVariables(); // The only thing inside here we don't actually need to change is the aspect variable, but it doesn't matter.
	perspective.initCrosshairModel();
}

// Call both when camera moves or rotates
function onPositionChange() {
	initViewMatrix();
}



export default {
	getPosition,
	canvas,
	getCanvasWidthVirtualPixels,
	getCanvasHeightVirtualPixels,
	getCanvasRect,
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
};