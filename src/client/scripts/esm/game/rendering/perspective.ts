// src/client/scripts/esm/game/rendering/perspective.ts

/**
 * This script handles our perspective mode!
 * Also rendering our crosshair
 */

// @ts-ignore
import mat4 from './gl-matrix.js';
// @ts-ignore
import guipause from '../gui/guipause.js';
import toast from '../gui/toast.js';
import webgl from './webgl.js';
import camera, { Mat4 } from './camera.js';
import { Renderable, createRenderable } from '../../webgl/Renderable.js';
import selection from '../chess/selection.js';
import frametracker from './frametracker.js';
import config from '../config.js';
import preferences from '../../components/header/preferences.js';
import gameslot from '../chess/gameslot.js';
import docutil from '../../util/docutil.js';
import { listener_document, listener_overlay } from '../chess/game.js';
import { Mouse } from '../input.js';

import type { Color } from '../../../../../shared/util/math/math.js';

/** Whether perspective mode is enabled. */
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
const crosshairColor: Color = [1, 1, 1, 1]; // RGBA. It will invert the colors in the buffer. This is what color BLACKS will be dyed! Whites will appear black.
/** The buffer model of the mouse crosshair when in perspective mode. */
let crosshairModel: Renderable;

// Getters
function getEnabled(): boolean {
	return enabled;
}
function getRotX(): number {
	return rotX;
}
function getRotZ(): number {
	return rotZ;
}
function getIsViewingBlackPerspective(): boolean {
	return isViewingBlackPerspective;
}

function toggle(): void {
	if (!docutil.isMouseSupported())
		return toast.show(translations['rendering'].perspective_mode_on_desktop);

	if (!enabled) enable();
	else disable();
}

function enable(): void {
	if (enabled)
		return console.error('Should not be enabling perspective when it is already enabled.');
	enabled = true;

	guipause.getelement_perspective().textContent = `${translations['rendering'].perspective}: ${translations['rendering'].on}`;

	guipause.callback_Resume();

	lockMouse();

	initCrosshairModel();

	toast.show(translations['rendering'].movement_tutorial);
}

function disable(): void {
	if (!enabled) return;
	frametracker.onVisualChange();

	enabled = false;
	// document.exitPointerLock()
	guipause.callback_Resume();

	guipause.getelement_perspective().textContent = `${translations['rendering'].perspective}: ${translations['rendering'].off}`;

	const viewWhitePerspective = gameslot.areInGame()
		? gameslot.isLoadedGameViewingWhitePerspective()
		: true;
	resetRotations(viewWhitePerspective);
}

// Sets rotations to orthographic view. Sensitive to if we're white or black.
function resetRotations(viewWhitePerspective = true): void {
	rotX = 0;
	rotZ = viewWhitePerspective ? 0 : 180;

	updateIsViewingBlackPerspective();

	camera.onPositionChange();
}

// Called when the mouse re-clicks the screen after ALREADY in perspective.
function relockMouse(): void {
	if (!enabled) return;
	if (isMouseLocked()) return;
	if (guipause.areWePaused()) return;
	if (selection.getSquarePawnIsCurrentlyPromotingOn()) return;

	lockMouse();
}

function lockMouse(): void {
	camera.canvas.requestPointerLock();
	// Disables OS-level mouse acceleration. This does NOT solve safari being more sensitive.
	// camera.canvas.requestPointerLock({ unadjustedMovement: true });
}

function update(): void {
	if (!enabled) return;
	// If they pushed escape, the mouse will no longer be locked
	// If the mouse is unlocked, don't rotate view.
	if (!isMouseLocked()) {
		// Check if needs to relock
		if (listener_overlay.isMouseClicked(Mouse.LEFT)) {
			listener_overlay.claimMouseClick(Mouse.LEFT);
			relockMouse();
		} else if (listener_overlay.isMouseDown(Mouse.LEFT))
			listener_overlay.claimMouseDown(Mouse.LEFT); // Prevents piece drag start from claiming this mouse down.
		return;
	}

	const mouseChange = listener_document.getPhysicalPointerDelta('mouse');
	if (!mouseChange) throw Error('Mouse pointer not present!');

	const thisSensitivity =
		mouseSensitivityMultiplier * (preferences.getPerspectiveSensitivity() / 100); // Divide by 100 to bring it to the range 0.25-2

	// Change rotations based on mouse motion
	rotX += mouseChange[1] * thisSensitivity;
	rotZ += mouseChange[0] * thisSensitivity;
	capRotations();
	updateIsViewingBlackPerspective();

	camera.onPositionChange(); // Calculate new viewMatrix
}

// Applies perspective rotation to default camera viewMatrix
function applyRotations(viewMatrix: Mat4): void {
	if (haveZeroRotation()) return; // No perspective rotation

	const cameraPos = camera.getPosition(); // devMode-sensitive

	// Shift the origin before rotating plane
	mat4.translate(viewMatrix, viewMatrix, cameraPos);

	if (rotX < 0) {
		// Looking up somewhat
		const rotXRad = rotX * (Math.PI / 180);
		mat4.rotate(viewMatrix, viewMatrix, rotXRad, [1, 0, 0]);
	}
	// const rotYRad = rotY * (Math.PI / 180);
	// mat4.rotate(viewMatrix, viewMatrix, rotYRad, [0,1,0])
	const rotZRad = rotZ * (Math.PI / 180);
	mat4.rotate(viewMatrix, viewMatrix, rotZRad, [0, 0, 1]);

	// Shift the origin back where it was
	const negativeCameraPos = [-cameraPos[0], -cameraPos[1], -cameraPos[2]];
	mat4.translate(viewMatrix, viewMatrix, negativeCameraPos);
}

/** Returns true if we have no perspective rotation */
function haveZeroRotation(): boolean {
	return rotX === 0 && rotZ === 0;
}

/** Returns *true* if we're looking above the horizon. */
function isLookingUp(): boolean {
	return enabled && rotX <= -90;
}

// Makes sure we don't go upside-down
function capRotations(): void {
	if (rotX > 0) rotX = 0;
	else if (rotX < -180) rotX = -180;
	if (rotZ < 0) rotZ += 360;
	else if (rotZ > 360) rotZ -= 360;
}

function isMouseLocked(): boolean {
	return document.pointerLockElement === camera.canvas;
}

// Buffer model of crosshair. Called whenever perspective is enabled, screen is resized, or devMode is toggled.
function initCrosshairModel(): void {
	if (!enabled) return;

	const screenHeight = camera.getScreenHeightWorld();

	const innerSide =
		((crosshairThickness / 2) * screenHeight) / camera.getCanvasHeightVirtualPixels();

	const [r, g, b, a] = crosshairColor;

	// prettier-ignore
	const data = new Float32Array([
		//       Vertex         Color
            -innerSide, -innerSide,       r, g, b, a,
            -innerSide,  innerSide,       r, g, b, a,
            innerSide,  innerSide,        r, g, b, a,

            innerSide,  innerSide,        r, g, b, a,
            innerSide,  -innerSide,       r, g, b, a,
            -innerSide,  -innerSide,      r, g, b, a,
	]);
	crosshairModel = createRenderable(data, 2, 'TRIANGLES', 'color', true);
}

function renderCrosshair(): void {
	if (!enabled) return;
	if (config.VIDEO_MODE) return; // Don't render while recording

	renderWithoutPerspectiveRotations(() => {
		webgl.executeWithInverseBlending(() => {
			crosshairModel.render();
		});
	});
}

/**
 * Renders (performs) whatever function is passed to it,
 * as if our camera was looking straight at the board from
 * white's perspective. ZERO perspective rotations!
 */
function renderWithoutPerspectiveRotations(func: Function): void {
	if (!enabled) return func();

	const perspectiveViewMatrixCopy = camera.getViewMatrix();
	camera.initViewMatrix(true); // Init view while ignoring perspective rotations

	func();

	camera.setViewMatrix(perspectiveViewMatrixCopy); // Re-put back the perspective rotation
}

// Used when the promotion UI opens
function unlockMouse(): void {
	if (!enabled) return;
	document.exitPointerLock();
}

function updateIsViewingBlackPerspective(): void {
	isViewingBlackPerspective = rotZ > 90 && rotZ < 270;
}

// Exports -----------------------------------------------------------------------

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
	renderWithoutPerspectiveRotations,
	unlockMouse,
	isLookingUp,
	initCrosshairModel,
};
