// src/client/scripts/board/rendering/frametracker.ts

/**
 * Tracks whether anything visual has changed on a board since its last render.
 * If nothing has, we can save compute by skipping rendering.
 *
 * This is a FACTORY: {@link createFrameTracker} builds one tracker per board. The module
 * default export is the interactive game's; every other board owns its own, on its RenderContext.
 */

// Types -----------------------------------------------------------------------

/** One independent frame tracker, as returned by {@link createFrameTracker}. */
export interface FrameTracker {
	/**
	 * The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen.
	 * @param frames - How many consecutive frames to render, starting with the next.
	 */
	onVisualChange(frames?: number): void;
	/** true if the next frame is owed a render. */
	doWeRenderNextFrame(): boolean;
	/** Prepares for the next frame. Call right after we finish a render frame. */
	onFrameRender(): void;
}

// Factory ---------------------------------------------------------------------

/** Creates one independent frame tracker, starting out due for a render. */
function createFrameTracker(): FrameTracker {
	/** How many upcoming frames are owed a render. */
	let framesOwed: number = 1;

	return {
		onVisualChange: (frames = 1): void => {
			framesOwed = Math.max(framesOwed, frames);
		},
		doWeRenderNextFrame: (): boolean => framesOwed > 0,
		onFrameRender: (): void => {
			framesOwed--;
		},
	};
}

/** The interactive game's frame tracker. */
const gameFrameTracker = createFrameTracker();

export default gameFrameTracker;
export { createFrameTracker };
