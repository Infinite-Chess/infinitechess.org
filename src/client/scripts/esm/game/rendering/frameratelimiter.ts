// src/client/scripts/esm/game/rendering/frameratelimiter.ts

/**
 * This module manages the framerate of the game.
 *
 * When on the title screen, the framerate (frequency of requestAnimationFrame calls)
 * is limited to 30fps to save GPU resources.
 */

import gameloader from '../chess/gameloader.js';

// Variables -------------------------------------------------

/**
 * Target framerate when not in a game.
 *
 * I cannot actually tell a difference between 30fps and 240fps there.
 */
const TARGET_FPS_TITLE_SCREEN = 30;

// State -----------------------------------------------------

/** Timestamp of the last frame that was actually rendered */
let lastFrameTime = 0;

/**
 * Set to true when we hear the canvas_resize event. We should bypass fps throttling and render the next frame immediately.
 *
 * Patches bug where resizing the window on the title screen (where fps is throttled) causes
 * rapid black flickering when the canvas is black, but we're waiting to render the next frame.
 */
let canvasResized: boolean = false;

document.addEventListener('canvas_resize', () => (canvasResized = true));

// Functions -------------------------------------------------

/**
 * Request an animation frame, with throttling applied when on the title screen.
 * This is a wrapper for calls to requestAnimationFrame().
 * @param callback - The callback function to execute on the next frame
 */
function requestFrame(callback: FrameRequestCallback): void {
	// Not in a game (title screen), throttle.
	const throttledCallback = (timestamp: number): void => {
		// If we're in a game, or canvas was resized, run at full speed.
		if (gameloader.areInAGame() || canvasResized) {
			canvasResized = false;
			lastFrameTime = timestamp;
			callback(timestamp);
			return;
		}

		// On the very first frame, or after a long pause (e.g. tab was inactive),
		// reset the timer to the current time.
		if (lastFrameTime === 0 || timestamp - lastFrameTime > 200) {
			lastFrameTime = timestamp;
		}

		// Calculate time elapsed since the last scheduled frame
		const elapsed = timestamp - lastFrameTime;

		// If enough time has passed, execute the callback
		const millisPerFrame = 1000 / TARGET_FPS_TITLE_SCREEN;
		if (elapsed >= millisPerFrame) {
			// Instead of resetting lastFrameTime to the current 'timestamp',
			// we advance it by a fixed interval. This creates a steady "tick"
			// that is not affected by the monitor's specific refresh rate, fixing frame-skipping.
			lastFrameTime += millisPerFrame;

			callback(timestamp);
		} else {
			// Not enough time has passed - schedule another check directly with requestAnimationFrame
			requestAnimationFrame(throttledCallback);
		}
	};

	requestAnimationFrame(throttledCallback);
}

// Exports --------------------------------------------------

export default {
	requestFrame,
};
