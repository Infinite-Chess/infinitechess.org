
// Import Start
import camera from './camera.js';
// Import End

/**
 * The WebGL rendering context. This is our web-based render engine.
 * @type {WebGL2RenderingContext}
 */
let gl; // The WebGL context. Is initiated in initGL()

/**
 * This script stores our global WebGL rendering context,
 * and other utility methods.
 */

/**
 * The color the screen should be cleared to every frame.
 * This can be changed to give the sky a different color.
 */
let clearColor = [0.5, 0.5, 0.5]; // Grey

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
 * @param {number[]} newClearColor - The new clear color: `[r,g,b]`
 */
function setClearColor(newClearColor) { clearColor = newClearColor; }

/**
 * Initiate the WebGL context. This is our web-based render engine.
 */
function init() {
	// Without alpha in the options, shading yields incorrect colors! This removes the alpha component of the back buffer.
	gl = camera.canvas.getContext('webgl2', { alpha: false });
	if (!gl) { // WebGL2 not supported
		alert(translations.webgl_unsupported);
		throw new Error("WebGL2 not supported by browser.");
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
}

/**
 * Clears color buffer and depth buffers.
 * Needs to be called every frame.
 */
function clearScreen() {
	gl.clearColor(...clearColor, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

/**
 * Toggles normal blending mode. Transparent objects will correctly have
 * their color shaded onto the color behind them.
 */
function toggleNormalBlending() {
	// Non-premultiplied alpha blending mode. (Pre-multiplied would be gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); 
}

/**
 * Toggles inverse blending mode, which will negate any color currently in the buffer.
 * 
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 */
function enableBlending_Inverse() { gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.GL_ZERO); }

/**
 * Executes a function (typically a render function) while the depth function paramter
 * is `ALWAYS`. Objects will be rendered no matter if they are behind or on top of other objects.
 * This is useful for preventing tearing when objects are on the same z-level in perspective.
 * @param {Function} func 
 * @param {...*} args - Arguments to pass to the function.
 */
function executeWithDepthFunc_ALWAYS(func, ...args) {
	// This prevents tearing when rendering in the same z-level and in perspective.
	gl.depthFunc(gl.ALWAYS); // Temporary toggle the depth function to ALWAYS.
	func(...args);
	gl.depthFunc(gl[defaultDepthFuncParam]); // Return to the original blending.
}

/**
 * Executes a function (typically a render function) while inverse blending is enabled.
 * Objects rendered will take the opposite color of what's currently in the buffer.
 * 
 * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
 * and white on black backgrounds.
 * @param {Function} func 
 */
function executeWithInverseBlending(func) {
	enableBlending_Inverse();
	func();
	toggleNormalBlending();
}

/**
 * Queries common WebGL context values and logs them to the console.
 * Each user device may have different supported values.
 * @param {WebGLRenderingContext} gl - The WebGL context.
 */
function queryWebGLContextInfo() {
	// Create a canvas and attempt to get WebGL 2 context, fallback to WebGL 1 if unavailable
	const canvas = document.createElement('canvas');
	const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');  // WebGL 2 if available, otherwise WebGL 1

	if (!gl) {
		console.error('WebGL is not supported in this browser.');
	} else {
		console.log(gl instanceof WebGL2RenderingContext ? 'WebGL 2 is supported' : 'WebGL 1 is supported');

		const params = [
			{ name: 'MAX_TEXTURE_SIZE', desc: 'Maximum texture size', guaranteed: 64 },
			{ name: 'MAX_CUBE_MAP_TEXTURE_SIZE', desc: 'Maximum cube map texture size', guaranteed: 16 },
			{ name: 'MAX_RENDERBUFFER_SIZE', desc: 'Maximum renderbuffer size', guaranteed: 1 },
			{ name: 'MAX_TEXTURE_IMAGE_UNITS', desc: 'Maximum texture units for fragment shader', guaranteed: 8 },
			{ name: 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', desc: 'Maximum texture units for vertex shader', guaranteed: 0 },
			{ name: 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', desc: 'Maximum combined texture units', guaranteed: 8 },
			{ name: 'MAX_VERTEX_ATTRIBS', desc: 'Maximum vertex attributes', guaranteed: 8 },
			{ name: 'MAX_VERTEX_UNIFORM_VECTORS', desc: 'Maximum vertex uniform vectors', guaranteed: 128 },
			{ name: 'MAX_FRAGMENT_UNIFORM_VECTORS', desc: 'Maximum fragment uniform vectors', guaranteed: 16 },
			{ name: 'MAX_VARYING_VECTORS', desc: 'Maximum varying vectors', guaranteed: 8 },
			{ name: 'MAX_VIEWPORT_DIMS', desc: 'Maximum viewport dimensions', guaranteed: [0, 0] },
			{ name: 'ALIASED_POINT_SIZE_RANGE', desc: 'Aliased point size range', guaranteed: [1, 1] },
			{ name: 'ALIASED_LINE_WIDTH_RANGE', desc: 'Aliased line width range', guaranteed: [1, 1] },
			{ name: 'MAX_VERTEX_UNIFORM_COMPONENTS', desc: 'Maximum vertex uniform components', guaranteed: 1024 },
			{ name: 'MAX_FRAGMENT_UNIFORM_COMPONENTS', desc: 'Maximum fragment uniform components', guaranteed: 1024 },
			{ name: 'MAX_VERTEX_OUTPUT_COMPONENTS', desc: 'Maximum vertex output components', guaranteed: 64 },
			{ name: 'MAX_FRAGMENT_INPUT_COMPONENTS', desc: 'Maximum fragment input components', guaranteed: 60 },
			{ name: 'MAX_DRAW_BUFFERS', desc: 'Maximum draw buffers', guaranteed: 4 },
			{ name: 'MAX_COLOR_ATTACHMENTS', desc: 'Maximum color attachments', guaranteed: 4 },
			{ name: 'MAX_SAMPLES', desc: 'Maximum samples', guaranteed: 4 }
		];

		// Output WebGL Context Information
		console.log('WebGL Context Information:');
		params.forEach(param => {
			try {
				const value = gl.getParameter(gl[param.name]);
				console.log(`${param.desc}:`, value, `(Guaranteed: ${param.guaranteed})`);
			} catch (e) {
				console.warn(`Error fetching ${param.name}:`, e.message);
			}
		});
	}

	// Shortened version:

	// Create a canvas and attempt to get WebGL 2 context, fallback to WebGL 1 if unavailable
	// const canvas = document.createElement('canvas');
	// const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');  // WebGL 2 if available, otherwise WebGL 1

	// if (!gl) {
	// 	console.error('WebGL not supported.');
	// } else {
	// 	console.log(gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1');

	// 	const params = [
	// 		{ name: 'MAX_TEXTURE_SIZE', guaranteed: 64 },
	// 		{ name: 'MAX_CUBE_MAP_TEXTURE_SIZE', guaranteed: 16 },
	// 		{ name: 'MAX_RENDERBUFFER_SIZE', guaranteed: 1 },
	// 		{ name: 'MAX_TEXTURE_IMAGE_UNITS', guaranteed: 8 },
	// 		{ name: 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', guaranteed: 0 },
	// 		{ name: 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', guaranteed: 8 },
	// 		{ name: 'MAX_VERTEX_ATTRIBS', guaranteed: 8 },
	// 		{ name: 'MAX_VERTEX_UNIFORM_VECTORS', guaranteed: 128 },
	// 		{ name: 'MAX_FRAGMENT_UNIFORM_VECTORS', guaranteed: 16 },
	// 		{ name: 'MAX_VARYING_VECTORS', guaranteed: 8 },
	// 		{ name: 'MAX_VIEWPORT_DIMS', guaranteed: [0, 0] },
	// 		{ name: 'ALIASED_POINT_SIZE_RANGE', guaranteed: [1, 1] },
	// 		{ name: 'ALIASED_LINE_WIDTH_RANGE', guaranteed: [1, 1] },
	// 		{ name: 'MAX_VERTEX_UNIFORM_COMPONENTS', guaranteed: 1024 },
	// 		{ name: 'MAX_FRAGMENT_UNIFORM_COMPONENTS', guaranteed: 1024 },
	// 		{ name: 'MAX_VERTEX_OUTPUT_COMPONENTS', guaranteed: 64 },
	// 		{ name: 'MAX_FRAGMENT_INPUT_COMPONENTS', guaranteed: 60 },
	// 		{ name: 'MAX_DRAW_BUFFERS', guaranteed: 4 },
	// 		{ name: 'MAX_COLOR_ATTACHMENTS', guaranteed: 4 },
	// 		{ name: 'MAX_SAMPLES', guaranteed: 4 }
	// 	];

	// 	params.forEach(param => {
	// 		try {
	// 			const value = gl.getParameter(gl[param.name]);
	// 			console.log(`${param.name}: ${value}, G: ${param.guaranteed}`);
	// 		} catch (e) {
	// 			console.warn(`Error on ${param.name}`);
	// 		}
	// 	});
	// }
}

/**
 * Enables depth testing in WebGL.
 * This will ensure that objects closer to the camera are drawn in front of objects farther away.
 */
function enableDepthTest() {
	gl.enable(gl.DEPTH_TEST);
}

/**
 * Disables depth testing in WebGL.
 * This will ensure that all objects are drawn regardless of their distance from the camera.
 * More efficient that setting the depth test condition to gl.ALWAYS
 */
function disableDepthTest() {
	gl.disable(gl.DEPTH_TEST);
}


export default {
	init,
	clearScreen,
	executeWithDepthFunc_ALWAYS,
	executeWithInverseBlending,
	setClearColor,
	queryWebGLContextInfo,
	enableDepthTest,
	disableDepthTest,
};

export { gl };