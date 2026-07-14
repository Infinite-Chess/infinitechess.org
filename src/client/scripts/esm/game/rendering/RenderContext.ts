// src/client/scripts/esm/game/rendering/RenderContext.ts

/**
 * A RenderContext bundles everything needed to draw a board onto ONE canvas: its WebGL
 * context, ProgramManager, camera, board position, piece textures, stencil masker, tile
 * renderer, and renderable factory. Two boards on screen at once (the interactive game and
 * a variant-preview tooltip) each own a separate instance, so neither disturbs the other.
 *
 * Shared render code takes a RenderContext and draws for whichever board it's told, rather
 * than reaching for process-wide singletons. The interactive game's view (camera/boardpos)
 * is still singular — those instances are passed in and shared with input/logic code.
 */

import type { Vec3 } from '../../../../../shared/util/math/vectors.js';
import type { Camera } from './camera.js';
import type { BoardPos } from './boardpos.js';
import type { BoardTiles } from './boardtiles.js';
import type { MaskedDraw } from '../../webgl/maskedDraw.js';
import type { TextureCache } from '../../chess/rendering/texturecache.js';
import type { ProgramManager } from '../../webgl/ProgramManager.js';
import type { RenderableFactory } from '../../webgl/Renderable.js';

import webgl from './webgl.js';
import { createBoardTiles } from './boardtiles.js';
import { createRenderableFactory } from '../../webgl/Renderable.js';

/** The parts a RenderContext is assembled from. */
interface RenderContextParams {
	gl: WebGL2RenderingContext;
	canvas: HTMLCanvasElement;
	programManager: ProgramManager;
	/** The camera whose matrices transform this context's models. */
	camera: Camera;
	/** The board position/scale this context's models are placed by. */
	boardpos: BoardPos;
	/** The piece-texture cache for this context's gl. */
	textures: TextureCache;
	/** The stencil masker for this context's gl. */
	maskedDraw: MaskedDraw;
}

/** Everything needed to render one board onto one canvas. */
class RenderContext {
	readonly gl: WebGL2RenderingContext;
	readonly canvas: HTMLCanvasElement;
	readonly programManager: ProgramManager;
	readonly camera: Camera;
	readonly boardpos: BoardPos;
	readonly textures: TextureCache;
	readonly maskedDraw: MaskedDraw;
	/** Creates renderable models bound to this context. */
	readonly renderable: RenderableFactory;
	/** Renders the board tiles into this context. */
	readonly boardtiles: BoardTiles;

	/** The color the screen is cleared to each frame in this context. */
	#clearColor: Vec3;

	constructor(params: RenderContextParams) {
		this.gl = params.gl;
		this.canvas = params.canvas;
		this.programManager = params.programManager;
		this.camera = params.camera;
		this.boardpos = params.boardpos;
		this.textures = params.textures;
		this.maskedDraw = params.maskedDraw;
		this.#clearColor = [0.5, 0.5, 0.5]; // Fallback sky color. Replaced by boardtiles.ts.
		this.renderable = createRenderableFactory(this.gl, this.programManager, this.camera);
		this.boardtiles = createBoardTiles(this);
	}

	/** Clears this context's color, depth, and stencil buffers. Call every frame before rendering. */
	clearScreen(): void {
		webgl.clearScreen(this.gl, this.#clearColor);
	}

	/** Sets the color this context's screen is cleared to (e.g. the sky color). */
	setClearColor(color: Vec3): void {
		this.#clearColor = color;
	}

	/** Runs a render function with the depth function forced to ALWAYS, in this context. */
	executeWithDepthFunc_ALWAYS(func: Function): void {
		webgl.executeWithDepthFunc_ALWAYS(func, this.gl);
	}

	/** Runs a render function with inverse blending enabled, in this context. */
	executeWithInverseBlending(func: Function): void {
		webgl.executeWithInverseBlending(func, this.gl);
	}
}

export default RenderContext;
