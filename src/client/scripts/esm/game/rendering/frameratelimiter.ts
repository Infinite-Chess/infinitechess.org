/**
 * This module manages the framerate of the game.
 *
 * When on the title screen, the framerate (frequency of requestAnimationFrame calls)
 * is limited to 30fps to save GPU resources.
 */

import gameloader from '../chess/gameloader.js';

// Variables -------------------------------------------------

/**
 * Target framerate when not in a game (30fps)
 *
 * I cannot actually tell a difference between 30fps and 240fps there.
 */
const TARGET_FPS_TITLE_SCREEN = 30;

// State -----------------------------------------------------

/** Timestamp of the last frame that was actually rendered */
let lastFrameTime = 0;

// Functions -------------------------------------------------

/**
 * Request an animation frame, with throttling applied when on the title screen.
 * This is a wrapper for calls to requestAnimationFrame().
 * @param callback - The callback function to execute on the next frame
 */
function requestFrame(callback: FrameRequestCallback): void {
	// If we're in a game, run at full speed.
	if (gameloader.areInAGame()) {
		requestAnimationFrame(callback);
		return;
	}

	// Not in a game (title screen), throttle.
	const throttledCallback = (timestamp: number): void => {
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
