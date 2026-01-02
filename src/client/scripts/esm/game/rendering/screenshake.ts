// src/client/scripts/esm/game/rendering/screenshake.ts

/**
 * This module can apply a screen shake effect to the camera when requested.
 */

import type { Mat4 } from './camera';

// @ts-ignore
import mat4 from './gl-matrix.js';
// @ts-ignore
import loadbalancer from '../misc/loadbalancer.js';
import camera from './camera';
import frametracker from './frametracker.js';
import { GameBus } from '../GameBus.js';

// Constants -----------------------------------------------------------------------

// Shake Parameters

/** Maximum rotation in any direction (in degrees). */
const MAX_ROTATION_DEGREES = 1.7; // Default: 2.1
/** Maximum translation in any direction (in world units). */
const MAX_TRANSLATION = 0.23; // Default: 0.28

/** How quickly trauma fades. Higher is faster. */
const TRAUMA_DECAY = 1.2;

// State ---------------------------------------------------------------------------

let trauma = 0.0; // Current shake intensity, 0.0 to 1.0

// Events --------------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => {
	clear();
});

// Functions -----------------------------------------------------------------------

/**
 * Adds trauma to the camera, triggering or intensifying the shake.
 * @param amount The amount of trauma to add (usually between 0.1 and 1.0).
 */
function trigger(amount: number): void {
	// console.log("Shake trauma added: " + amount);
	trauma = Math.min(trauma + amount, 1.0);
	frametracker.onVisualChange(); // Request an animation frame
	camera.onPositionChange(); // Camera will update its view matrix
}

/** Clears all trauma, stopping any shake immediately. */
function clear(): void {
	trauma = 0.0;
	frametracker.onVisualChange();
	camera.onPositionChange(); // Camera will update its view matrix
}

/**
 * Updates the trauma level. Called once per frame.
 */
function update(): void {
	if (trauma === 0) return;
	// Decrease trauma over time
	const deltaTimeSecs = loadbalancer.getDeltaTime();
	trauma = Math.max(trauma - deltaTimeSecs * TRAUMA_DECAY, 0);
	frametracker.onVisualChange(); // Request an animation frame
	camera.onPositionChange(); // Camera will update its view matrix
}

/**
 * Calculates and returns a 4x4 transformation matrix representing the current shake offset.
 * If there is no trauma, it returns an identity matrix (no shake).
 */
function getShakeMatrix(): Mat4 {
	if (trauma <= 0) return mat4.create(); // Returns an identity matrix

	// The intensity of the shake is proportional to the square of the trauma.
	// This makes small amounts of trauma barely noticeable, and large amounts very dramatic.
	const shakePower = trauma;

	/** Generates a random value in a [-1, 1] range. */
	const getRandomNoise = (): number => (Math.random() - 0.5) * 2;

	// Calculate Rotation
	const yaw = MAX_ROTATION_DEGREES * shakePower * getRandomNoise();
	const pitch = MAX_ROTATION_DEGREES * shakePower * getRandomNoise();
	const roll = MAX_ROTATION_DEGREES * shakePower * getRandomNoise();

	// Convert degrees to radians for gl-matrix
	const yawRad = (yaw * Math.PI) / 180;
	const pitchRad = (pitch * Math.PI) / 180;
	const rollRad = (roll * Math.PI) / 180;

	// Calculate Translation
	const offsetX = MAX_TRANSLATION * shakePower * getRandomNoise();
	const offsetY = MAX_TRANSLATION * shakePower * getRandomNoise();
	const offsetZ = MAX_TRANSLATION * shakePower * getRandomNoise();

	// Create the Transformation Matrix
	const shakeMatrix = mat4.create();

	// Apply translation
	mat4.translate(shakeMatrix, shakeMatrix, [offsetX, offsetY, offsetZ]);

	// Apply rotations (order can matter, Z then X then Y is common)
	mat4.rotateZ(shakeMatrix, shakeMatrix, rollRad);
	mat4.rotateX(shakeMatrix, shakeMatrix, pitchRad);
	mat4.rotateY(shakeMatrix, shakeMatrix, yawRad);

	return shakeMatrix;
}

// Exports -------------------------------------------------------------------------

export default {
	trigger,
	update,
	getShakeMatrix,
};
