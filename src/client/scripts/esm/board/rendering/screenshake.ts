// src/client/scripts/esm/board/rendering/screenshake.ts

/**
 * A screen shake effect, applied to a camera's view matrix.
 *
 * This is a FACTORY: {@link createScreenShake} builds one independent shake instance.
 * Each camera owns its own, so one board's shake never moves another board's view.
 */

import type { Mat4 } from '../../webgl/Renderable.js';

import mat4 from '../../webgl/gl-matrix.js';
import deltatime from '../deltatime.js';
import { GameBus } from '../GameBus.js';

// Types ---------------------------------------------------------------------------

/** Optional integration hooks a screen shake fires into. */
interface ScreenShakeHooks {
	/** Fired whenever the trauma level changes, so the owner can resync its view matrix. */
	onTraumaChange?: () => void;
}

/** One independent screen shake instance, as returned by {@link createScreenShake}. */
export interface ScreenShake {
	/**
	 * Adds trauma, triggering or intensifying the shake.
	 * @param amount The amount of trauma to add (usually between 0.1 and 1.0).
	 */
	trigger(amount: number): void;
	/** Decays the trauma level. Call once per frame. */
	update(): void;
	/**
	 * Returns a 4x4 transformation matrix representing the current shake offset.
	 * If there is no trauma, it returns an identity matrix (no shake).
	 */
	getShakeMatrix(): Mat4;
	/**
	 * Wires the bus listener that clears trauma when the game unloads. The preview
	 * instance intentionally never calls this, as no game ever loads into it.
	 */
	wireGlobalListeners(): void;
}

// Constants -----------------------------------------------------------------------

// Shake Parameters

/** Maximum rotation in any direction (in degrees). */
const MAX_ROTATION_DEGREES = 1.7; // Default: 2.1
/** Maximum translation in any direction (in world units). */
const MAX_TRANSLATION = 0.23; // Default: 0.28

/** How quickly trauma fades. Higher is faster. */
const TRAUMA_DECAY = 1.2;

// Factory -------------------------------------------------------------------------

/** Creates one independent screen shake instance with its own trauma level. */
function createScreenShake(hooks: ScreenShakeHooks = {}): ScreenShake {
	const onTraumaChange = hooks.onTraumaChange;

	// State -----------------------------------------------------------------------

	let trauma = 0.0; // Current shake intensity, 0.0 to 1.0

	// Functions -------------------------------------------------------------------

	function trigger(amount: number): void {
		// console.log("Shake trauma added: " + amount);
		trauma = Math.min(trauma + amount, 1.0);
		onTraumaChange?.();
	}

	/** Clears all trauma, stopping any shake immediately. */
	function clear(): void {
		if (trauma === 0) return;
		trauma = 0.0;
		onTraumaChange?.();
	}

	function update(): void {
		if (trauma === 0) return;
		// Decrease trauma over time
		const deltaTimeSecs = deltatime.get();
		trauma = Math.max(trauma - deltaTimeSecs * TRAUMA_DECAY, 0);
		onTraumaChange?.();
	}

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

	function wireGlobalListeners(): void {
		GameBus.addEventListener('game-unloaded', () => clear());
	}

	return {
		trigger,
		update,
		getShakeMatrix,
		wireGlobalListeners,
	};
}

// Exports -------------------------------------------------------------------------

export { createScreenShake };
