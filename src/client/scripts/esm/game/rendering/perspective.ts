// src/client/scripts/esm/game/rendering/perspective.ts

/**
 * This script handles our perspective mode!
 * Also rendering our crosshair
 */

import type { Color } from '../../../../../shared/util/math/math.js';

import webgl from './webgl.js';
import config from '../config.js';
import camera from './camera.js';
import preferences from '../../components/header/preferences.js';
import frametracker from './frametracker.js';
import { Renderable, createRenderable } from '../../webgl/Renderable.js';

/** Whether perspective mode is enabled. */
let enabled = false;

/**
 * Whether we're currently in white's perspective.
 * Affects rotation resets.
 */
let viewWhitePerspective: boolean = true;

const mouseSensitivityMultiplier = 0.13; // 0.13 Default   This is Multiplied by our perspective_sensitivity in the preferences.

// Crosshair
const crosshairThickness = 2.5; // Default: 2.5
const crosshairColor: Color = [1, 1, 1, 1]; // RGBA. It will invert the colors in the buffer. This is what color BLACKS will be dyed! Whites will appear black.
/** The buffer model of the mouse crosshair when in perspective mode. */
let crosshairModel: Renderable;

// Listeners ---------------------------------------------------------------------

// Listen for canvas resize, FOV, and camera debug-toggle events to reinit the crosshair
document.addEventListener('canvas_resize', () => initCrosshairModel());
document.addEventListener('fov-change', () => initCrosshairModel());
document.addEventListener('camera-debug-toggle', () => initCrosshairModel());

// Functions --------------------------------------------------------------------

function getEnabled(): boolean {
	return enabled;
}

function toggle(): void {
	if (!enabled) enable();
	else disable();
}

function enable(): void {
	if (enabled)
		return console.error('Should not be enabling perspective when it is already enabled.');
	enabled = true;

	lockMouse();

	initCrosshairModel();
}

function disable(): void {
	if (!enabled) return;
	frametracker.onVisualChange();

	enabled = false;

	resetRotations();
}

function setViewSide(whitePerspective: boolean): void {
	viewWhitePerspective = whitePerspective;
}

// Sets rotations to orthographic view. Sensitive to if we're white or black.
function resetRotations(): void {
	camera.setPerspectiveRotation(0, viewWhitePerspective ? 0 : 180);
}

// Called when the mouse re-clicks the screen after ALREADY in perspective.
function relockMouse(): void {
	if (!enabled) return;
	if (isMouseLocked()) return;

	lockMouse();
}

function lockMouse(): void {
	camera.canvas.requestPointerLock();
	// Disables OS-level mouse acceleration. This does NOT solve safari being more sensitive.
	// camera.canvas.requestPointerLock({ unadjustedMovement: true });
}

/**
 * Applies a rotation delta based on mouse movement. Call externally after
 * reading the pointer delta from the input listener.
 * @param mouseChangeX - Horizontal mouse delta.
 * @param mouseChangeY - Vertical mouse delta.
 */
function addRotation(mouseChangeX: number, mouseChangeY: number): void {
	const sensitivity =
		mouseSensitivityMultiplier * (preferences.getPerspectiveSensitivity() / 100); // Divide by 100 to bring it to the range 0.25-2

	const newRotX = camera.getRotX() + mouseChangeY * sensitivity;
	const newRotZ = camera.getRotZ() + mouseChangeX * sensitivity;
	camera.setPerspectiveRotation(newRotX, newRotZ);
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

	camera.renderWithoutPerspectiveRotations(() => {
		webgl.executeWithInverseBlending(() => {
			crosshairModel.render();
		});
	});
}

// Used when the promotion UI opens
function unlockMouse(): void {
	if (!enabled) return;
	document.exitPointerLock();
}

// Exports -----------------------------------------------------------------------

export default {
	getEnabled,
	toggle,
	enable,
	disable,
	setViewSide,
	resetRotations,
	relockMouse,
	addRotation,
	isMouseLocked,
	renderCrosshair,
	unlockMouse,
	initCrosshairModel,
};
