/**
 * This script stores an internal variable that keeps track of whether
 * anything visual has changed on-screen in the game this frame.
 * If nothing has, we can save compute by skipping rendering.
 *
 * ZERO dependancies.
 */

/** Whether there has been a visual change on-screen the past frame. */
let hasBeenVisualChange: boolean = true;

/** Whether we're currently in a game. */
let inGame: boolean = false;

/** Frame counter used for framerate limiting on menus. */
let frameCount: number = 0;

/**
 * How many frames to skip between renders when on menus (not in a game).
 * A value of 2 means render every other frame is skipped.
 */
const MENU_FRAME_SKIP = 2;

/** The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen. */
function onVisualChange(): void {
	// console.error("onVisualChange()");
	hasBeenVisualChange = true;
}

/**
 * Sets whether we're currently in a game.
 * When not in a game, framerate is limited to reduce GPU usage.
 */
function setInGame(value: boolean): void {
	inGame = value;
	frameCount = 0;
}

/** true if there has been a visual change on-screen since last frame. */
function doWeRenderNextFrame(): boolean {
	if (!hasBeenVisualChange) return false;

	// When in a game, always render if there's a visual change
	if (inGame) return true;

	// When on menus (title screen, etc.), limit framerate to reduce GPU usage
	// from the continuously animated background.
	frameCount++;
	if (frameCount >= MENU_FRAME_SKIP) {
		frameCount = 0;
		return true;
	}

	return false;
}

/**
 * Resets {@link hasBeenVisualChange} to false, to prepare for next frame.
 * Call right after we finish a render frame.
 */
function onFrameRender(): void {
	hasBeenVisualChange = false;
}

/** Returns whether we're currently in a game. */
function isInGame(): boolean {
	return inGame;
}

export default {
	onVisualChange,
	doWeRenderNextFrame,
	onFrameRender,
	setInGame,
	isInGame,
};
