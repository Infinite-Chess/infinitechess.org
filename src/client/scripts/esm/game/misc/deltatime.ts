// src/client/scripts/esm/game/misc/deltatime.ts

/**
 * Owns frame delta-time calculation and storage.
 * Called each frame by loadbalancer.ts with the current timestamp.
 *
 * ZERO dependencies — safe to import from pure rendering scripts.
 */

let lastFrameTime: number = 0;
let deltaTime: number = 0;

/** Returns the amount of seconds that have passed since the last frame. */
function get(): number {
	return deltaTime;
}

/**
 * Called by loadbalancer.ts each frame with the current timestamp (in ms).
 * Computes and stores the new delta time.
 */
function update(timestamp: number): void {
	deltaTime = (timestamp - lastFrameTime) / 1000;
	lastFrameTime = timestamp;
}

export default {
	get,
	update,
};
