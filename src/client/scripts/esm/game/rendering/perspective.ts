// src/client/scripts/esm/game/rendering/perspective.ts

/**
 * This script handles our perspective mode!
 * Also rendering our crosshair
 */

import type { Color } from '../../../../../shared/types/color.js';

import camera from '../../board/rendering/camera.js';
import gameslot from '../chess/gameslot.js';
import gamescene from './gamescene.js';
import primitives from '../../board/rendering/primitives.js';
import preferences from '../../util/preferences.js';
import { GameBus } from '../../board/GameBus.js';
import frametracker from '../../board/rendering/frametracker.js';
import { VIDEO_MODE } from '../config.js';
import { createRenderable } from './gamerenderable.js';

// Constants -------------------------------------------------------------------

/** Multiplied by the perspective_sensitivity preference. */
const SENSITIVITY_MULTIPLIER = 0.13;

/** The crosshair's width, in virtual pixels. */
const CROSSHAIR_THICKNESS = 2.5;
/** RGBA. Inverted against the buffer, so this is what BLACKS get dyed — whites appear black. */
const CROSSHAIR_COLOR: Color = [1, 1, 1, 1];

// State -----------------------------------------------------------------------

/** Whether perspective mode is enabled. */
let enabled = false;

// Functions -------------------------------------------------------------------

/** Whether perspective mode is enabled. */
function getEnabled(): boolean {
	return enabled;
}

/** Toggles perspective mode. */
function toggle(): void {
	if (!enabled) enable();
	else disable();
}

/** Enables perspective mode, locking the mouse. */
function enable(): void {
	if (enabled)
		return console.error('Should not be enabling perspective when it is already enabled.');

	enabled = true;
	lockMouse();
	GameBus.dispatch('perspective-toggle');
}

/** Disables perspective mode, resetting the camera's rotation. */
function disable(): void {
	if (!enabled) return;

	frametracker.onVisualChange();
	enabled = false;
	camera.setPerspectiveRotation(0, gameslot.areViewingWhite() ? 0 : 180); // Reset rotations
	GameBus.dispatch('perspective-toggle');
}

/** Called when the mouse re-clicks the screen after ALREADY in perspective. */
function relockMouse(): void {
	if (!enabled) return;
	if (isMouseLocked()) return;

	lockMouse();
}

/** Locks the pointer to the canvas. */
function lockMouse(): void {
	camera.getCanvas().requestPointerLock();
}

/**
 * Applies a rotation delta based on mouse movement. Call externally after
 * reading the pointer delta from the input listener.
 * @param mouseChangeX - Horizontal mouse delta.
 * @param mouseChangeY - Vertical mouse delta.
 */
function addRotation(mouseChangeX: number, mouseChangeY: number): void {
	const sensitivity = SENSITIVITY_MULTIPLIER * (preferences.getPerspectiveSensitivity() / 100); // Divide by 100 to bring it to the range 0.25-2

	const newRotX = camera.getRotX() + mouseChangeY * sensitivity;
	const newRotZ = camera.getRotZ() + mouseChangeX * sensitivity;
	camera.setPerspectiveRotation(newRotX, newRotZ);
}

/** Whether the pointer is locked to the canvas. */
function isMouseLocked(): boolean {
	return document.pointerLockElement === camera.getCanvas();
}

/** Renders the crosshair at the center of the screen, inverting the colors beneath it. */
function renderCrosshair(): void {
	if (!enabled) return;
	if (VIDEO_MODE) return; // Don't render while recording

	const halfWidth =
		((CROSSHAIR_THICKNESS / 2) * camera.getScreenHeightWorld()) /
		camera.getCanvasHeightVirtualPixels();
	const data = primitives.Quad_Color(-halfWidth, -halfWidth, halfWidth, halfWidth, CROSSHAIR_COLOR); // prettier-ignore

	camera.renderWithoutPerspectiveRotations(() => {
		gamescene.getGameContext().executeWithInverseBlending(() => {
			createRenderable(data, 2, 'TRIANGLES', 'color', true).render();
		});
	});
}

/** Unlocks the pointer. Used when the promotion UI opens. */
function unlockMouse(): void {
	if (!enabled) return;
	document.exitPointerLock();
}

// Exports ---------------------------------------------------------------------

export default {
	getEnabled,
	toggle,
	disable,
	relockMouse,
	addRotation,
	isMouseLocked,
	renderCrosshair,
	unlockMouse,
};
