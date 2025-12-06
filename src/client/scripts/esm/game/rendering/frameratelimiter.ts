/**
 * This module manages the framerate of the canvas WebGL game.
 * It wraps requestAnimationFrame() and throttles it to 30fps when not in a game.
 * When in a game, it does not throttle at all.
 *
 * ZERO dependencies (other than gameloader for game state checking).
 */

import gameloader from '../chess/gameloader.js';

/** Target framerate when not in a game (30fps) */
const TARGET_FPS_OUT_OF_GAME = 30;

/** Time per frame in milliseconds for 30fps */
const MS_PER_FRAME_OUT_OF_GAME = 1000 / TARGET_FPS_OUT_OF_GAME;

/** Timestamp of the last frame that was actually rendered */
let lastFrameTime = 0;

/**
 * Request an animation frame, with throttling applied when not in a game.
 * This replaces direct calls to requestAnimationFrame().
 *
 * @param callback - The callback function to execute on the next frame
 */
function requestFrame(callback: FrameRequestCallback): void {
	// If we're in a game, don't throttle at all - run at full speed
	if (gameloader.areInAGame()) {
		requestAnimationFrame(callback);
		return;
	}

	// Not in a game - throttle to 30fps
	requestAnimationFrame((timestamp: number) => {
		// Calculate time elapsed since last frame
		const elapsed = timestamp - lastFrameTime;

		// If enough time has passed, execute the callback
		if (elapsed >= MS_PER_FRAME_OUT_OF_GAME) {
			lastFrameTime = timestamp;
			callback(timestamp);
		} else {
			// Not enough time has passed - schedule another check
			requestFrame(callback);
		}
	});
}

export default {
	requestFrame,
};
