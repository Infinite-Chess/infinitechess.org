// src/client/scripts/esm/board/rendering/frametracker.ts

/**
 * Tracks whether anything visual has changed on a board since its last render.
 * If nothing has, we can save compute by skipping rendering.
 *
 * This is a FACTORY: {@link createFrameTracker} builds one tracker per board. The module
 * default export is the interactive game's; every other board owns its own, on its RenderContext.
 *
 * ZERO dependancies.
 */

// Types -----------------------------------------------------------------------

/** One independent frame tracker, as returned by {@link createFrameTracker}. */
export interface FrameTracker {
	/** The next frame will be rendered. Compute can be saved if nothing has visibly changed on-screen. */
	onVisualChange(): void;
	/** true if there has been a visual change on-screen since last frame. */
	doWeRenderNextFrame(): boolean;
	/** Prepares for the next frame. Call right after we finish a render frame. */
	onFrameRender(): void;
}

// Factory ---------------------------------------------------------------------

/** Creates one independent frame tracker, starting out due for a render. */
function createFrameTracker(): FrameTracker {
	/** Whether there has been a visual change on-screen the past frame. */
	let hasBeenVisualChange: boolean = true;

	return {
		onVisualChange: (): void => {
			hasBeenVisualChange = true;
		},
		doWeRenderNextFrame: (): boolean => hasBeenVisualChange,
		onFrameRender: (): void => {
			hasBeenVisualChange = false;
		},
	};
}

// The interactive game's frame tracker. All existing `frametracker.foo()` call sites use this.
const gameFrameTracker = createFrameTracker();

export default gameFrameTracker;
export { createFrameTracker };
