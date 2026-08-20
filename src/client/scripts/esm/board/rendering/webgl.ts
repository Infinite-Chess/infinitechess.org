// src/client/scripts/esm/board/rendering/webgl.ts

import type { Vec3 } from '../../../../../shared/util/math/vectors.js';

/**
 * This script builds WebGL rendering contexts, and stores our
 * interactive game's context, and contains other utility methods.
 *
 * {@link createContext} builds & configures a fresh WebGL2 context for any canvas.
 * {@link init} creates the interactive game's context and stores it as the module {@link gl}
 * export (used by game-only code). The variant-preview tooltip creates its own context via
 * {@link createContext}. The stateless helpers below take an optional `glCtx` that defaults
 * to the game context, so game-only callers stay unchanged while per-context code passes its own.
 */

/** The interactive game's WebGL rendering context. Initiated in {@link init}. */
let gl: WebGL2RenderingContext; // The WebGL context. Is initiated in init()
/** Whether {@link init} has run and {@link gl} is ready to use. */
let initialized: boolean = false;

/**
 * The default screen clear color, used to initialize a fresh context and as the
 * fallback for {@link clearScreen}. Per-context sky colors live on each RenderContext.
 */
const clearColor: Vec3 = [0.5, 0.5, 0.5]; // Grey

/**
 * Specifies the condition under which a fragment passes the depth test,
 * determining whether it should be drawn based on its depth value
 * relative to the existing depth buffer values.
 *
 * By default, we want objects rendered to only be visible if they are closer
 * (less than) or equal to other objects already rendered this frame. The gl
 * depth function can be changed throughout the run, but we always reset it
 * back to this default afterward.
 *
 * Accepted values: `NEVER`, `LESS`, `EQUAL`, `LEQUAL`, `GREATER`, `NOTEQUAL`, `GEQUAL`, `ALWAYS`
 */
const defaultDepthFuncParam = 'LEQUAL';

/**
 * Whether to cull (skip) rendering back faces.
 * We can prevent the rasteurizer from calculating pixels on faces facing AWAY from us with backface culling.
 *
 * IF WE AREN'T CAREFUL about all vertices going into the same clockwise/counterclockwise
 * direction, then some objects will be invisible!
 */
const culling = false;
/**
 * If true, whether a face is determined as a front face depends
 * on whether it's vertices move in a clockwise direction, otherwise counterclockwise.
 */
const frontFaceVerticesAreClockwise = true;

/**
 * Builds & configures a fresh WebGL2 rendering context for the given canvas.
 * Does NOT touch module state — use {@link init} for the interactive game's context.
 */
function createContext(canvasElement: HTMLCanvasElement): WebGL2RenderingContext {
	// Without `alpha: false` in the options, shading yields incorrect colors! This removes the alpha component of the back buffer.
	const newContext = canvasElement.getContext('webgl2', {
		alpha: false,
		stencil: true,
		preserveDrawingBuffer: true, // Reduces likelihood of context lost?
	}); // Stencil required for masking world border stuff
	if (!newContext) {
		// WebGL2 not supported
		alert(translations.webgl_unsupported);
		throw new Error('WebGL2 not supported by browser.');
	}

	newContext.clearDepth(1.0); // Set the clear depth value
	clearScreen(newContext);

	newContext.enable(newContext.DEPTH_TEST);
	newContext.depthFunc(newContext[defaultDepthFuncParam]);

	newContext.enable(newContext.BLEND);
	toggleNormalBlending(newContext);

	if (culling) {
		newContext.enable(newContext.CULL_FACE);
		const dir = frontFaceVerticesAreClockwise ? newContext.CW : newContext.CCW;
		newContext.frontFace(dir); // Specifies what faces are considered front, depending on their vertices direction.
		newContext.cullFace(newContext.BACK); // Skip rendering back faces. Alertnatively we could skip rendering FRONT faces.
	}

	newContext.clearStencil(0); // Good practice, although 0 is the default

	return newContext;
}

/** Initiates the interactive game's WebGL context, stored as the module {@link gl} export. */
function init(canvasElement: HTMLCanvasElement): WebGL2RenderingContext {
	gl = createContext(canvasElement);
	initialized = true;
	return gl;
}

/** Whether the game's WebGL context has been initialized via {@link init}. */
function isInitialized(): boolean {
	return initialized;
}

/**
 * Clears color buffer and depth buffers.
 * Needs to be called every frame.
 * @param glCtx - The context to clear. Defaults to the game context.
 * @param color - The color to clear to. Defaults to the game clear color.
 */
function clearScreen(glCtx: WebGL2RenderingContext, color: Vec3 = clearColor): void {
	glCtx.clearColor(...color, 1.0);
	glCtx.stencilMask(0xff); // Ensure all stencil bits are writable before clearing.
	glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT | glCtx.STENCIL_BUFFER_BIT);
}

/**
 * Toggles normal blending mode. Transparent objects will correctly have
 * their color shaded onto the color behind them.
 */
function toggleNormalBlending(glCtx: WebGL2RenderingContext = gl): void {
	// Non-premultiplied alpha blending mode. (Pre-multiplied would be gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);
}

/**
 * Toggles inverse blending mode, which will negate any color currently in the buffer.
 *
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 */
function enableBlending_Inverse(glCtx: WebGL2RenderingContext = gl): void {
	glCtx.blendFunc(glCtx.ONE_MINUS_DST_COLOR, glCtx.ZERO);
}

/**
 * Executes a function (typically a render function) while the depth function paramter
 * is `ALWAYS`. Objects will be rendered no matter if they are behind or on top of other objects.
 * This is useful for preventing tearing when objects are on the same z-level in perspective.
 * @param func - The render function to run.
 * @param glCtx - The context to affect. Defaults to the game context.
 */
function executeWithDepthFunc_ALWAYS(func: Function, glCtx: WebGL2RenderingContext = gl): void {
	// This prevents tearing when rendering in the same z-level and in perspective.
	glCtx.depthFunc(glCtx.ALWAYS); // Temporary toggle the depth function to ALWAYS.
	func();
	glCtx.depthFunc(glCtx[defaultDepthFuncParam]); // Return to the original blending.
}

/**
 * Executes a function (typically a render function) while inverse blending is enabled.
 * Objects rendered will take the opposite color of what's currently in the buffer.
 *
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 * @param func - The render function to run.
 * @param glCtx - The context to affect. Defaults to the game context.
 */
function executeWithInverseBlending(func: Function, glCtx: WebGL2RenderingContext = gl): void {
	enableBlending_Inverse(glCtx);
	func();
	toggleNormalBlending(glCtx);
}

// /**
//  * Queries common WebGL context values and logs them to the console.
//  * Each user device may have different supported values.
//  */
// function queryWebGLContextInfo() {
// 	// Create a canvas and attempt to get WebGL 2 context, fallback to WebGL 1 if unavailable
// 	const canvas = document.createElement('canvas');
// 	const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');  // WebGL 2 if available, otherwise WebGL 1

// 	if (!gl) {
// 		console.error('WebGL is not supported in this browser.');
// 	} else {
// 		console.log(gl instanceof WebGL2RenderingContext ? 'WebGL 2 is supported' : 'WebGL 1 is supported');

// 		const params = [
// 			{ name: 'MAX_TEXTURE_SIZE', desc: 'Maximum texture size', guaranteed: 64 },
// 			{ name: 'MAX_CUBE_MAP_TEXTURE_SIZE', desc: 'Maximum cube map texture size', guaranteed: 16 },
// 			{ name: 'MAX_RENDERBUFFER_SIZE', desc: 'Maximum renderbuffer size', guaranteed: 1 },
// 			{ name: 'MAX_TEXTURE_IMAGE_UNITS', desc: 'Maximum texture units for fragment shader', guaranteed: 8 },
// 			{ name: 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', desc: 'Maximum texture units for vertex shader', guaranteed: 0 },
// 			{ name: 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', desc: 'Maximum combined texture units', guaranteed: 8 },
// 			{ name: 'MAX_VERTEX_ATTRIBS', desc: 'Maximum vertex attributes', guaranteed: 8 },
// 			{ name: 'MAX_VERTEX_UNIFORM_VECTORS', desc: 'Maximum vertex uniform vectors', guaranteed: 128 },
// 			{ name: 'MAX_FRAGMENT_UNIFORM_VECTORS', desc: 'Maximum fragment uniform vectors', guaranteed: 16 },
// 			{ name: 'MAX_VARYING_VECTORS', desc: 'Maximum varying vectors', guaranteed: 8 },
// 			{ name: 'MAX_VIEWPORT_DIMS', desc: 'Maximum viewport dimensions', guaranteed: [0, 0] },
// 			{ name: 'ALIASED_POINT_SIZE_RANGE', desc: 'Aliased point size range', guaranteed: [1, 1] },
// 			{ name: 'ALIASED_LINE_WIDTH_RANGE', desc: 'Aliased line width range', guaranteed: [1, 1] },
// 			{ name: 'MAX_VERTEX_UNIFORM_COMPONENTS', desc: 'Maximum vertex uniform components', guaranteed: 1024 },
// 			{ name: 'MAX_FRAGMENT_UNIFORM_COMPONENTS', desc: 'Maximum fragment uniform components', guaranteed: 1024 },
// 			{ name: 'MAX_VERTEX_OUTPUT_COMPONENTS', desc: 'Maximum vertex output components', guaranteed: 64 },
// 			{ name: 'MAX_FRAGMENT_INPUT_COMPONENTS', desc: 'Maximum fragment input components', guaranteed: 60 },
// 			{ name: 'MAX_DRAW_BUFFERS', desc: 'Maximum draw buffers', guaranteed: 4 },
// 			{ name: 'MAX_COLOR_ATTACHMENTS', desc: 'Maximum color attachments', guaranteed: 4 },
// 			{ name: 'MAX_SAMPLES', desc: 'Maximum samples', guaranteed: 4 }
// 		];

// 		// Output WebGL Context Information
// 		console.log('WebGL Context Information:');
// 		params.forEach(param => {
// 			try {
// 				const value = gl.getParameter(gl[param.name]);
// 				console.log(`${param.desc}:`, value, `(Guaranteed: ${param.guaranteed})`);
// 			} catch (e) {
// 				console.warn(`Error fetching ${param.name}:`, e.message);
// 			}
// 		});
// 	}

// 	// Shortened version:

// 	// Create a canvas and attempt to get WebGL 2 context, fallback to WebGL 1 if unavailable
// 	// const canvas = document.createElement('canvas');
// 	// const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');  // WebGL 2 if available, otherwise WebGL 1

// 	// if (!gl) {
// 	// 	console.error('WebGL not supported.');
// 	// } else {
// 	// 	console.log(gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1');

// 	// 	const params = [
// 	// 		{ name: 'MAX_TEXTURE_SIZE', guaranteed: 64 },
// 	// 		{ name: 'MAX_CUBE_MAP_TEXTURE_SIZE', guaranteed: 16 },
// 	// 		{ name: 'MAX_RENDERBUFFER_SIZE', guaranteed: 1 },
// 	// 		{ name: 'MAX_TEXTURE_IMAGE_UNITS', guaranteed: 8 },
// 	// 		{ name: 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', guaranteed: 0 },
// 	// 		{ name: 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', guaranteed: 8 },
// 	// 		{ name: 'MAX_VERTEX_ATTRIBS', guaranteed: 8 },
// 	// 		{ name: 'MAX_VERTEX_UNIFORM_VECTORS', guaranteed: 128 },
// 	// 		{ name: 'MAX_FRAGMENT_UNIFORM_VECTORS', guaranteed: 16 },
// 	// 		{ name: 'MAX_VARYING_VECTORS', guaranteed: 8 },
// 	// 		{ name: 'MAX_VIEWPORT_DIMS', guaranteed: [0, 0] },
// 	// 		{ name: 'ALIASED_POINT_SIZE_RANGE', guaranteed: [1, 1] },
// 	// 		{ name: 'ALIASED_LINE_WIDTH_RANGE', guaranteed: [1, 1] },
// 	// 		{ name: 'MAX_VERTEX_UNIFORM_COMPONENTS', guaranteed: 1024 },
// 	// 		{ name: 'MAX_FRAGMENT_UNIFORM_COMPONENTS', guaranteed: 1024 },
// 	// 		{ name: 'MAX_VERTEX_OUTPUT_COMPONENTS', guaranteed: 64 },
// 	// 		{ name: 'MAX_FRAGMENT_INPUT_COMPONENTS', guaranteed: 60 },
// 	// 		{ name: 'MAX_DRAW_BUFFERS', guaranteed: 4 },
// 	// 		{ name: 'MAX_COLOR_ATTACHMENTS', guaranteed: 4 },
// 	// 		{ name: 'MAX_SAMPLES', guaranteed: 4 }
// 	// 	];

// 	// 	params.forEach(param => {
// 	// 		try {
// 	// 			const value = gl.getParameter(gl[param.name]);
// 	// 			console.log(`${param.name}: ${value}, G: ${param.guaranteed}`);
// 	// 		} catch (e) {
// 	// 			console.warn(`Error on ${param.name}`);
// 	// 		}
// 	// 	});
// 	// }
// }

export default {
	createContext,
	init,
	isInitialized,
	clearScreen,
	executeWithDepthFunc_ALWAYS,
	executeWithInverseBlending,
	// queryWebGLContextInfo,
};

// TODO: Don't export this, but rather pass the gl returned from init() to all scripts that need it.
export { gl };
