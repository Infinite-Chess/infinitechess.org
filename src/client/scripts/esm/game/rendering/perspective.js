
// Import Start
import guipause from '../gui/guipause.js';
import webgl from './webgl.js';
import camera from './camera.js';
import statustext from '../gui/statustext.js';
import { createModel } from './buffermodel.js';
import mat4 from './gl-matrix.js';
import selection from '../chess/selection.js';
import frametracker from './frametracker.js';
import config from '../config.js';
import preferences from '../../components/header/preferences.js';
import gameslot from '../chess/gameslot.js';
import docutil from '../../util/docutil.js';
import { listener_document, listener_overlay } from '../chess/game.js';
import { Mouse } from '../input.js';
// Import End

/**
 * Type Definitions
 * @typedef {import('./buffermodel.js').BufferModel} BufferModel
 */

"use strict";

/**
 * This script handles our perspective mode!
 * Also rendering our crosshair
 */

let enabled = false;

let rotX = 0; // Positive x looks down. Min 0
let rotZ = 0; // Positive z looks right
// rotY = 0, // Y is tilt, we will not be using this

let isViewingBlackPerspective = false;

const mouseSensitivityMultiplier = 0.13; // 0.13 Default   This is Multiplied by our perspective_sensitivity in the preferences.

// How far to render the board into the distance
const distToRenderBoard = 1500; // Default 1500. When changing this, also change  camera.getZFar()

// Crosshair
const crosshairThickness = 2.5; // Default: 2.5
const crosshairWidth = 18; // Default: 16.7
const crosshairColor = [1, 1, 1, 1]; // RGBA. It will invert the colors in the buffer. This is what color BLACKS will be dyed! Whites will appear black.
/** The buffer model of the mouse crosshair when in perspective mode.
 * @type {BufferModel} */
let crosshairModel;


// Getters
function getEnabled() { return enabled; }
function getRotX() { return rotX; }
function getRotZ() { return rotZ; }
function getIsViewingBlackPerspective() { return isViewingBlackPerspective; }

function toggle() {
	if (!docutil.isMouseSupported()) return statustext.showStatus(translations.rendering.perspective_mode_on_desktop);

	if (!enabled) enable();
	else disable();
}

function enable() {
	if (enabled) return console.error("Should not be enabling perspective when it is already enabled.");
	enabled = true;

	guipause.getelement_perspective().textContent = `${translations.rendering.perspective}: ${translations.rendering.on}`;

	guipause.callback_Resume();

	lockMouse();

	initCrosshairModel();

	statustext.showStatus(translations.rendering.movement_tutorial);
}

function disable() {
	if (!enabled) return;
	frametracker.onVisualChange();

	enabled = false;
	// document.exitPointerLock()
	guipause.callback_Resume();

	guipause.getelement_perspective().textContent = `${translations.rendering.perspective}: ${translations.rendering.off}`;
    
	const viewWhitePerspective = gameslot.areInGame() ? gameslot.isLoadedGameViewingWhitePerspective() : true;
	resetRotations(viewWhitePerspective);
}

// Sets rotations to orthographic view. Sensitive to if we're white or black.
function resetRotations(viewWhitePerspective = true) {
	rotX = 0;
	rotZ = viewWhitePerspective ? 0 : 180;

	updateIsViewingBlackPerspective();

	camera.onPositionChange();
}

// Called when the mouse re-clicks the screen after ALREADY in perspective.
function relockMouse() {
	if (!enabled) return;
	if (isMouseLocked()) return;
	if (guipause.areWePaused()) return;
	if (selection.getSquarePawnIsCurrentlyPromotingOn()) return;

	lockMouse();
}

function lockMouse() {
	camera.canvas.requestPointerLock();
	// Disables OS-level mouse acceleration. This does NOT solve safari being more sensitive.
	// camera.canvas.requestPointerLock({ unadjustedMovement: true });
}

function update() {
	if (!enabled) return;
	// If they pushed escape, the mouse will no longer be locked
	// If the mouse is unlocked, don't rotate view.
	if (!isMouseLocked()) {
		// Check if needs to relock
		if (listener_overlay.isMouseClicked(Mouse.LEFT)) {
			listener_overlay.claimMouseClick(Mouse.LEFT);
			relockMouse();
		} else if (listener_overlay.isMouseDown(Mouse.LEFT)) listener_overlay.claimMouseDown(Mouse.LEFT); // Prevents piece drag start from claiming this mouse down.
		return;
	}

	const mouseChange = listener_document.getPointerDelta('mouse');
	if (!mouseChange) throw Error("Mouse pointer not present!");

	const thisSensitivity = mouseSensitivityMultiplier * (preferences.getPerspectiveSensitivity() / 100); // Divide by 100 to bring it to the range 0.25-2

	// Change rotations based on mouse motion
	rotX += mouseChange[1] * thisSensitivity;
	rotZ += mouseChange[0] * thisSensitivity;
	capRotations();
	updateIsViewingBlackPerspective();

	camera.onPositionChange(); // Calculate new viewMatrix
}

// Applies perspective rotation to default camera viewMatrix
function applyRotations(viewMatrix) {
	if (haveZeroRotation()) return; // No perspective rotation

	const cameraPos = camera.getPosition(); // devMode-sensitive

	// Shift the origin before rotating plane
	mat4.translate(viewMatrix, viewMatrix, cameraPos);

	if (rotX < 0) { // Looking up somewhat
		const rotXRad = rotX * (Math.PI / 180);
		mat4.rotate(viewMatrix, viewMatrix, rotXRad, [1,0,0]);
	}
	// const rotYRad = rotY * (Math.PI / 180);
	// mat4.rotate(viewMatrix, viewMatrix, rotYRad, [0,1,0])
	const rotZRad = rotZ * (Math.PI / 180);
	mat4.rotate(viewMatrix, viewMatrix, rotZRad, [0,0,1]);

	// Shift the origin back where it was
	const negativeCameraPos = [-cameraPos[0], -cameraPos[1], -cameraPos[2]];
	mat4.translate(viewMatrix, viewMatrix, negativeCameraPos);
}

// Returns true if we have no perspective rotation
function haveZeroRotation() {
	return rotX === 0 && rotZ === 0;
}

/**
 * Returns *true* if we're looking above the horizon.
 * @returns {boolean}
 */
function isLookingUp() { return enabled && rotX <= -90; }

// Makes sure we don't go upside-down
function capRotations() {
	if (rotX > 0) rotX = 0;
	else if (rotX < -180) rotX = -180;
	if (rotZ < 0) rotZ += 360;
	else if (rotZ > 360) rotZ -= 360;
}

function isMouseLocked() {
	return document.pointerLockElement === camera.canvas
        || document.mozPointerLockElement === camera.canvas
        || document.webkitPointerLockElement === camera.canvas;
}

// Buffer model of crosshair. Called whenever perspective is enabled, screen is resized, or devMode is toggled.
function initCrosshairModel() {
	if (!enabled) return;

	const screenHeight = camera.getScreenHeightWorld();

	const innerSide = (crosshairThickness / 2) * screenHeight  / camera.getCanvasHeightVirtualPixels();
	const outerSide = (crosshairWidth / 2) * screenHeight / camera.getCanvasHeightVirtualPixels();

	const [r,g,b,a] = crosshairColor;

	const data = new Float32Array([
        //       Vertex         Color
        //              MEDICAL PLUS sign cross hair
        // Horz bar
            -outerSide, -innerSide,       r, g, b, a,
            -outerSide,  innerSide,       r, g, b, a,
            outerSide,  innerSide,        r, g, b, a,
            
            outerSide,  innerSide,        r, g, b, a,
            outerSide,  -innerSide,       r, g, b, a,
            -outerSide,  -innerSide,      r, g, b, a,
        // Vert bar
            -innerSide, -outerSide,       r, g, b, a,
            -innerSide,  outerSide,       r, g, b, a,
            innerSide,  outerSide,        r, g, b, a,
            
            innerSide,  outerSide,        r, g, b, a,
            innerSide,  -outerSide,       r, g, b, a,
            -innerSide,  -outerSide,      r, g, b, a,
            -outerSide, -innerSide,       r, g, b, a,
        //              CROSS crosshair
        // Horz bar
        //     -outerSide, -innerSide,       r, g, b, a,
        //     -outerSide,  innerSide,       r, g, b, a,
        //     outerSide,  innerSide,        r, g, b, a,
            
        //     outerSide,  innerSide,        r, g, b, a,
        //     outerSide,  -innerSide,       r, g, b, a,
        //     -outerSide,  -innerSide,      r, g, b, a,
        // // Vert bar, top half
        //     -innerSide, innerSide,       r, g, b, a,
        //     -innerSide,  outerSide,       r, g, b, a,
        //     innerSide,  outerSide,        r, g, b, a,
            
        //     innerSide,  outerSide,        r, g, b, a,
        //     innerSide,  innerSide,       r, g, b, a,
        //     -innerSide,  innerSide,      r, g, b, a,
        //     // Vert bar, bottom half
        //     -innerSide, -innerSide,       r, g, b, a,
        //     -innerSide,  -outerSide,       r, g, b, a,
        //     innerSide,  -outerSide,        r, g, b, a,
            
        //     innerSide,  -outerSide,        r, g, b, a,
        //     innerSide,  -innerSide,       r, g, b, a,
        //     -innerSide,  -innerSide,      r, g, b, a,
    ]);
	crosshairModel = createModel(data, 2, "TRIANGLES", true); 
}

function renderCrosshair() {
	if (!enabled) return;
	if (config.VIDEO_MODE) return; // Don't render while recording

	const perspectiveViewMatrixCopy = camera.getViewMatrix();
	camera.initViewMatrix(true); // Init view while ignoring perspective rotations

	webgl.executeWithInverseBlending(() => {
		crosshairModel.render();
	});
    
	camera.setViewMatrix(perspectiveViewMatrixCopy); // Re-put back the perspective rotation
}

// Used when the promotion UI opens
function unlockMouse() {
	if (!enabled) return;
	document.exitPointerLock();
}

function updateIsViewingBlackPerspective() {
	isViewingBlackPerspective = rotZ > 90 && rotZ < 270;
}

export default {
	getEnabled,
	getRotX,
	getRotZ,
	distToRenderBoard,
	getIsViewingBlackPerspective,
	toggle,
	disable,
	resetRotations,
	relockMouse,
	update,
	applyRotations,
	isMouseLocked,
	renderCrosshair,
	unlockMouse,
	isLookingUp,
	initCrosshairModel
};