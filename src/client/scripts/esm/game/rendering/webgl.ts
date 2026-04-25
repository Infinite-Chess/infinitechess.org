// src/client/scripts/esm/game/rendering/webgl.ts

import type { Vec3 } from '../../../../../shared/util/math/vectors.js';

import camera from './camera.js';

/**
 * This script stores our global WebGL rendering context,
 * and other utility methods.
 */

/** The WebGL rendering context. This is our web-based render engine. */
let gl: WebGL2RenderingContext; // The WebGL context. Is initiated in initGL()

/**
 * The color the screen should be cleared to every frame.
 * This can be changed to give the sky a different color.
 */
let clearColor: Vec3 = [0.5, 0.5, 0.5]; // Grey

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
 * Sets the color the screen will be cleared to every frame.
 *
 * This is useful for changing the sky color.
 * @param newClearColor - The new clear color: `[r,g,b]`
 */
function setClearColor(newClearColor: Vec3): void {
	clearColor = newClearColor;
}

/**
 * Initiate the WebGL context. This is our web-based render engine.
 */
function init(): void {
	// Without alpha in the options, shading yields incorrect colors! This removes the alpha component of the back buffer.
	const newContext = camera.canvas.getContext('webgl2', {
		alpha: false,
		stencil: true,
		preserveDrawingBuffer: true, // Reduces likelihood of context lost?
	}); // Stencil required for masking world border stuff
	if (!newContext) {
		// WebGL2 not supported
		alert(translations.webgl_unsupported);
		throw new Error('WebGL2 not supported by browser.');
		// gl = camera.canvas.getContext('webgl', { alpha: false });
	}
	// if (!gl) { // Init WebGL experimental
	// 	console.log("Browser doesn't support WebGL-1, falling back on experiment-webgl.");
	// 	gl = camera.canvas.getContext('experimental-webgl', { alpha: false});
	// }
	// if (!gl) { // Experimental also failed to init
	// 	alert(translations.webgl_unsupported);
	// 	throw new Error("WebGL not supported.");
	// }

	gl = newContext;

	gl.clearDepth(1.0); // Set the clear depth value
	clearScreen();

	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl[defaultDepthFuncParam]);

	gl.enable(gl.BLEND);
	toggleNormalBlending();

	if (culling) {
		gl.enable(gl.CULL_FACE);
		const dir = frontFaceVerticesAreClockwise ? gl.CW : gl.CCW;
		gl.frontFace(dir); // Specifies what faces are considered front, depending on their vertices direction.
		gl.cullFace(gl.BACK); // Skip rendering back faces. Alertnatively we could skip rendering FRONT faces.
	}

	gl.clearStencil(0); // Good practice, although 0 is the default
}

/**
 * Tracks how many times {@link executeMaskedDraw} has been called this frame.
 * Each call gets its own isolated bit pair in the 8-bit stencil buffer (2 bits per call, 4
 * calls max), so old stencil values from one call can never contaminate a later call.
 */
let stencilCallIndex: number = 0;

/**
 * Clears color buffer and depth buffers.
 * Needs to be called every frame.
 */
function clearScreen(): void {
	gl.clearColor(...clearColor, 1.0);
	gl.stencilMask(0xff); // Ensure all stencil bits are writable before clearing.
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
	stencilCallIndex = 0; // Each call to executeMaskedDraw gets a fresh bit pair this frame.
}

/**
 * Toggles normal blending mode. Transparent objects will correctly have
 * their color shaded onto the color behind them.
 */
function toggleNormalBlending(): void {
	// Non-premultiplied alpha blending mode. (Pre-multiplied would be gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

/**
 * Toggles inverse blending mode, which will negate any color currently in the buffer.
 *
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 */
function enableBlending_Inverse(): void {
	gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ZERO);
}

/**
 * Executes a function (typically a render function) while the depth function paramter
 * is `ALWAYS`. Objects will be rendered no matter if they are behind or on top of other objects.
 * This is useful for preventing tearing when objects are on the same z-level in perspective.
 */
function executeWithDepthFunc_ALWAYS(func: Function): void {
	// This prevents tearing when rendering in the same z-level and in perspective.
	gl.depthFunc(gl.ALWAYS); // Temporary toggle the depth function to ALWAYS.
	func();
	gl.depthFunc(gl[defaultDepthFuncParam]); // Return to the original blending.
}

/**
 * Executes a function (typically a render function) while inverse blending is enabled.
 * Objects rendered will take the opposite color of what's currently in the buffer.
 *
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 */
function executeWithInverseBlending(func: Function): void {
	enableBlending_Inverse();
	func();
	toggleNormalBlending();
}

/**
 * Renders content using a flexible stencil mask.
 * Handles all stencil buffer state changes internally, ensuring a clean state before and after.
 * @param drawInclusionMaskFunc - A function that renders the INCLUSION ZONE MASK. The main scene will appear inside this zone.
 * @param drawExclusionMaskFunc - A function that renders the EXCLUSION ZONE MASK. The main scene will NOT appear inside this zone.
 * @param drawContentFunc - A function that renders the main scene content. Will be masked.
 * @param intersectionMode - Determines the behavior for intersections of the two mask types:
 * 							'and' => Main scene will only be drawn where the inclusion mask and inversion of the exclusion mask intersect.
 * 							'or' => Main scene will be drawn inside the inclusion mask and inversion of the exclusion mask.
 * 							Has no effect if only one mask type is provided.
 */
function executeMaskedDraw(
	drawInclusionMaskFunc: Function | undefined,
	drawExclusionMaskFunc: Function | undefined,
	drawContentFunc: Function,
	intersectionMode: 'and' | 'or',
): void {
	if (!drawExclusionMaskFunc && !drawInclusionMaskFunc)
		throw Error('No mask functions provided.');

	/**
	 * Assign this call its own isolated bit pair in the 8-bit stencil buffer.
	 *
	 * We use 2 bits per call (supporting up to 4 calls/frame — we currently use up to 3).
	 * The bit pairs from different calls never overlap, so leftover stencil values from
	 * earlier calls are invisible to us because we only test/write bits within our own mask.
	 *
	 * Example  callIndex 0 → bitMask=0x03, exclusionBit=0x01, inclusionBit=0x02
	 *          callIndex 1 → bitMask=0x0C, exclusionBit=0x04, inclusionBit=0x08
	 *          callIndex 2 → bitMask=0x30, exclusionBit=0x10, inclusionBit=0x20
	 */

	if (stencilCallIndex >= 4)
		throw Error(
			'executeMaskedDraw() called more than 4 times per frame. The 8-bit stencil buffer only supports 4 calls (2 bits each).',
		);
	const callIndex = stencilCallIndex++;
	const exclusionBit = 1 << (callIndex * 2); // e.g. 0x01, 0x04, 0x10
	const inclusionBit = 1 << (callIndex * 2 + 1); // e.g. 0x02, 0x08, 0x20
	const bitMask = exclusionBit | inclusionBit; // e.g. 0x03, 0x0C, 0x30

	// Enable the stencil test.
	gl.enable(gl.STENCIL_TEST);
	// We don't want the mask to be affected by depth.
	// WITHOUT THIS, sometimes the mask doesn't do its masking, because it
	// initially failed the depth test if something else is rendered in front of it!
	gl.disable(gl.DEPTH_TEST);

	try {
		// We want to write to the stencil buffer, but make the mask itself invisible.
		gl.colorMask(false, false, false, false); // Disable writing to the color buffer
		gl.depthMask(false); // Disable writing to the depth buffer
		// Only write to our assigned bit pair; bits from other calls are preserved.
		gl.stencilMask(bitMask);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

		// Draw the Masks

		if (intersectionMode === 'and') {
			drawInclusion();
			drawExclusion();
		} else {
			drawExclusion();
			drawInclusion();
		}

		function drawInclusion(): void {
			if (!drawInclusionMaskFunc) return;
			// Writes inclusionBit into our bit pair. The readMask in stencilFunc is
			// irrelevant here (ALWAYS passes regardless), but ref is what REPLACE stores.
			gl.stencilFunc(gl.ALWAYS, inclusionBit, bitMask);
			drawInclusionMaskFunc();
		}
		function drawExclusion(): void {
			if (!drawExclusionMaskFunc) return;
			// Writes exclusionBit into our bit pair.
			gl.stencilFunc(gl.ALWAYS, exclusionBit, bitMask);
			drawExclusionMaskFunc();
		}

		// Draw the Main Content

		// Re-enable drawing to the screen.
		gl.colorMask(true, true, true, true);
		gl.depthMask(true);
		// During content draw, don't write to the stencil; only test against our bit pair.
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

		if (drawExclusionMaskFunc && drawInclusionMaskFunc) {
			// Case: COMPOSITE MASK (both exclusion and inclusion masks provided)
			if (intersectionMode === 'or') {
				// Draw where our bit pair is NOT set to exclusionBit (i.e. 0 or inclusionBit).
				gl.stencilFunc(gl.NOTEQUAL, exclusionBit, bitMask);
			} else {
				// Draw where our bit pair is exactly inclusionBit (not 0, not exclusionBit).
				gl.stencilFunc(gl.EQUAL, inclusionBit, bitMask);
			}
		} else if (drawExclusionMaskFunc) {
			// Case: EXCLUSION ONLY. Draw where our bit pair is not exclusionBit (i.e. 0).
			gl.stencilFunc(gl.NOTEQUAL, exclusionBit, bitMask);
		} else if (drawInclusionMaskFunc) {
			// Case: INCLUSION ONLY. Draw where our bit pair is inclusionBit.
			gl.stencilFunc(gl.EQUAL, inclusionBit, bitMask);
		} else throw Error('Unexpected!');

		drawContentFunc();
	} finally {
		// Return to a normal state.
		gl.disable(gl.STENCIL_TEST);
		gl.enable(gl.DEPTH_TEST);
	}
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

/**
 * Enables depth testing in WebGL.
 * This will ensure that objects closer to the camera are drawn in front of objects farther away.
 */
function enableDepthTest(): void {
	gl.enable(gl.DEPTH_TEST);
}

/**
 * Disables depth testing in WebGL.
 * This will ensure that all objects are drawn regardless of their distance from the camera.
 * More efficient that setting the depth test condition to gl.ALWAYS
 */
function disableDepthTest(): void {
	gl.disable(gl.DEPTH_TEST);
}

export default {
	init,
	clearScreen,
	executeWithDepthFunc_ALWAYS,
	executeWithInverseBlending,
	executeMaskedDraw,
	setClearColor,
	// queryWebGLContextInfo,
	enableDepthTest,
	disableDepthTest,
};

export { gl };
