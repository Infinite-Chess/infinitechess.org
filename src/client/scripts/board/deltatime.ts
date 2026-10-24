// src/client/scripts/board/deltatime.ts

/**
 * Owns frame delta-time calculation and storage.
 * Called each frame by frameprofiler.ts with the current timestamp.
 */

// State -----------------------------------------------------------------------

let lastFrameTime: number = 0;

/** The amount of seconds that have passed since the last frame. */
let deltaTime: number = 0;

// Functions -------------------------------------------------------------------

/** Returns the amount of seconds that have passed since the last frame. */
function get(): number {
	return deltaTime;
}

/** Computes and stores the new delta time from the current frame's timestamp (in ms). */
function update(timestamp: number): void {
	deltaTime = (timestamp - lastFrameTime) / 1000;
	lastFrameTime = timestamp;
}

// Exports ---------------------------------------------------------------------

export default {
	get,
	update,
};
