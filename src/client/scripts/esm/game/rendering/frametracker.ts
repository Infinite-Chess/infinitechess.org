
/**
 * This script stores an internal variable that keeps track of whether
 * anything visual has changed on-screen in the game this frame.
 * If nothing has, we can save compute by skipping rendering.
 * 
 * ZERO dependancies.
 */

/** Whether there has been a visual change on-screen the past frame. */
let hasBeenVisualChange: boolean = true;


/** The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen. */
function onVisualChange() {
	hasBeenVisualChange = true;
}

/** true if there has been a visual change on-screen since last frame. */
function doWeRenderNextFrame() {
	return hasBeenVisualChange;
}

/**
 * Resets {@link hasBeenVisualChange} to false, to prepare for next frame.
 * Call right after we finish a render frame.
 */
function onFrameRender() {
	hasBeenVisualChange = false;
}



export default {
	onVisualChange,
	doWeRenderNextFrame,
	onFrameRender,
};