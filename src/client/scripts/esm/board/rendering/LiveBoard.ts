// src/client/scripts/esm/board/rendering/LiveBoard.ts

/**
 * A LiveBoard is a {@link RenderContext} whose board plays a game out: alongside everything
 * needed to draw a board, it holds that board's moving parts — its piece animations, its
 * arrow indicators, its water ripples, and the post-processing pipeline they render through.
 *
 * The interactive game owns one; the home page owns one per live game it shows. Shared
 * live-board code takes one and acts on whichever board it's told, so no board's
 * animations, arrows or ripples ever leak onto another.
 */

import type { Ripples } from './waterripples.js';
import type { Animation } from './animation/animation.js';
import type { ArrowsState } from './arrows/arrows.js';
import type { RenderContextParams } from './RenderContext.js';

import arrows from './arrows/arrows.js';
import waterripples from './waterripples.js';
import RenderContext from './RenderContext.js';
import { PostProcessingPipeline } from '../../webgl/postprocessing/PostProcessingPipeline.js';

/** Everything a LiveBoard is built from. */
interface LiveBoardParams extends RenderContextParams {
	/** Whether moves on this board play their sound. Its ripples and screen shakes play regardless. */
	sound: boolean;
}

/** A board playing a game out, onto one canvas. */
class LiveBoard extends RenderContext {
	readonly sound: boolean;
	/** The piece animations currently playing. */
	readonly animations: Animation[] = [];
	/** Its arrow indicators: their mode, and this frame's arrows. */
	readonly arrows: ArrowsState = arrows.createState();
	readonly ripples: Ripples;
	/** Draws the scene through any post-processing passes active this frame. */
	readonly pipeline: PostProcessingPipeline;

	constructor(params: LiveBoardParams) {
		super(params);
		this.sound = params.sound;
		this.ripples = waterripples.create(this.programManager);
		this.pipeline = new PostProcessingPipeline(this.gl, this.programManager);
	}

	/** Resizes everything sized to the canvas. Call whenever its pixel buffer resizes. */
	resize(width: number, height: number): void {
		this.pipeline.resize(width, height);
	}
}

export default LiveBoard;
