
// Import Start
import { gl } from './webgl.js';
import camera from './camera.js';
// Import End

"use strict";

// Type definitions...

/**
 * @typedef {Object} ShaderProgram
 * @property {WebGLProgram} program - The actual program that our webgl context can switch to with gl.useProgram() before rendering.
 * @property {Object} attribLocations - An object containing the attribute locations on the gpu. This info is needed before rendering with this program.
 * @property {Object} uniformLocations - An object containing the uniform locations on the gpu. This info is needed before rendering with this program.
 */

/** This script handles the creation of, and stores our shaders. */

/** The size of GL_POINTS in **physical** pixels, not virtual.
 * Naviary's system's max is 8191. Perhaps multiply by {@link camera.getPixelDensity}
 * to make it look the same size on retina displays as non-retina? */
const pointSize = 1;

/**
 * Shader uniforms that MUST BE SET every before every single render call,
 * or the value from the previous render call's setting will bleed through.
 * 
 * For example, the position of the last rendered item,
 * or the tint-color of the last rendered item.
 * 
 * These uniforms should be optional, BUT if they are not provided,
 * we have to set them to a default value, before rendering, to avoid this!
 */
const manualUniforms = ['worldMatrix','tintColor'];


/** The shader programs at our disposal.
 * The world matrix uniform needs to be set with each draw call,
 * it transforms and rotates the bound mesh. */
const programs = {
	/** Renders meshes where each point has a color value.
     * 
     * Each point in the mesh must contain positional data (2 or 3 numbers)
     * followed by the color data (4 numbers).
     * @type {ShaderProgram}
     */
	colorProgram: undefined,
	/**
	 * Uses Instanced rendering to render instances that contain positional and color data.
	 * 
	 * The vertex data of the instance needs to have a stride of 6-7 (2-3 position, 4 color),
	 * while the instance-specific data array needs to have a stride of 2-3 (2-3 position offset).
     * @type {ShaderProgram}
     */
	colorProgram_Instanced: undefined,
	/** 
     * Renders meshes with bound textures.
     * 
     * Each point in the mesh must contain positional data (2 or 3 numbers)
     * followed by the texture data (2 numbers).
     * @type {ShaderProgram}
     */
	textureProgram: undefined,
	/** 
     * Renders meshes with bound textures AND color values at each point.
     * This can be used to tint each point of the mesh a desired color.
     * 
     * Each point must contain the positional data (2 or 3 numbers),
     * followed by the texture data (2 numbers),
     * and lastly followed by the color data (4 numbers).
     * The meshes obviously use more memory than the other shader programs.
     * @type {ShaderProgram}
     */
	coloredTextureProgram: undefined,
	/** 
     * Renders meshes with bound textures AND tints the entire mesh a specific color.
     * This is more memory efficient than the colored texture program.
     * 
     * Each point must contain the positional data (2 or 3 numbers),
     * followed by the texture data (2 numbers).
     * Set the tint by updating the uniform `tintColor` before rendering by using gl.uniform4fv(),
     * or just by sending the uniform value into {@link BufferModel.render}
     * @type {ShaderProgram}
     */
	tintedTextureProgram: undefined, // Renders textures with color
};

/** Initiates the shader programs we will be using.
 * Call this after initiating the webgl context. */
function initPrograms() {
	programs.colorProgram = createColorProgram();
	programs.colorProgram_Instanced = createColorProgram_Instanced();
	programs.textureProgram = createTextureProgram();
	programs.coloredTextureProgram = createColoredTextureProgram();
	programs.tintedTextureProgram = createTintedTextureProgram();
}

/**
 * Creates and return a shader program that is
 * capable of rendering meshes with colored vertices.
 * @returns {ShaderProgram}
 */
function createColorProgram() {
	const specifyPointSize = false;
	const pointSizeLine = specifyPointSize ? `gl_PointSize = ${(pointSize * camera.getPixelDensity()).toFixed(1)}; // Default: 7.0. Sets the point size of gl.POINTS`
        : '';
	// Vertex shader. For every vertex, applies matrix multiplication to find it's position on the canvas.
	// Attributes receive data from buffer. Uniforms are like global variables, they stay the same.
	const vsSource = `
        attribute vec4 aVertexPosition;
        attribute vec4 aVertexColor;

        uniform mat4 uWorldMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjMatrix;

        varying lowp vec4 vColor;

        void main() {
            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
            vColor = aVertexColor;
            ${pointSizeLine}
        }
    `;
	// Fragment shader. Called for every pixel on each shape to be drawn. Color.
	const fsSource = `
        varying lowp vec4 vColor;

        void main() {
            gl_FragColor = vColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			color: gl.getAttribLocation(program, 'aVertexColor')
		},
		uniformLocations: {
			projMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
			viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
			worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix')
		},
	};
}

/**
 * Creates and return a shader program that is
 * capable of rendering meshes with colored vertices
 * USING INSTANCED RENDERING.
 * @returns {ShaderProgram}
 */
function createColorProgram_Instanced() {
	// Vertex shader. For every vertex, applies matrix multiplication to find it's position on the canvas.
	// Attributes receive data from buffer. Uniforms are like global variables, they stay the same.
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec4 aVertexColor;
		in vec4 aInstancePosition; // Per-instance position offset attribute

        uniform mat4 uWorldMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjMatrix;

        out lowp vec4 vColor;

        void main() {
			// Add the instance offset to the vertex position
			vec4 transformedVertexPosition = vec4(aVertexPosition.xyz + aInstancePosition.xyz, 1.0);

            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * transformedVertexPosition;
            vColor = aVertexColor;
        }
    `;
	// Fragment shader. Called for every pixel on each shape to be drawn. Color.
	const fsSource = `#version 300 es
        precision lowp float;

        in lowp vec4 vColor;
        out vec4 fragColor;

        void main() {
            fragColor = vColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			color: gl.getAttribLocation(program, 'aVertexColor'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition')
		},
		uniformLocations: {
			projMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
			viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
			worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix')
		},
	};
}

/**
 * Creates and returns a shader program that is capable of rendering meshes with a bound texture.
 * If WebGL 2 is supported, this shader will apply a bias to the LOD (mipmap level) to sharpen the textures.
 * @returns {ShaderProgram}
 */
function createTextureProgram() {
	// GLSL version 300 for WebGL 2, otherwise WebGL 1 shader code
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec2 aTextureCoord;

        uniform mat4 uWorldMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjMatrix;

        out vec2 vTextureCoord;

        void main(void) {
            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord;
        }
    `;

	const fsSource = `#version 300 es
        precision lowp float;

        in vec2 vTextureCoord;
        uniform sampler2D uSampler;

        out vec4 fragColor;

        void main(void) {
            fragColor = texture(uSampler, vTextureCoord, -0.5); // Apply a mipmap level bias so as to make the textures sharper.
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
		},
		uniformLocations: {
			projMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
			viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
			worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix'),
			uSampler: gl.getUniformLocation(program, 'uSampler'),
		},
	};
}

/**
 * Creates and return a shader program that is capable of
 * rendering meshes with a bound texture AND colored vertices.
 * @returns {ShaderProgram}
*/
function createColoredTextureProgram() {
	// Vertex shader. For every vertex, applies matrix multiplication to find it's position on the canvas.
	// Attributes receive data from buffer. Uniforms are like global variables, they stay the same.
	const vsSource = `#version 300 es
		in vec4 aVertexPosition;
		in vec2 aTextureCoord;
		in vec4 aVertexColor;

		uniform mat4 uWorldMatrix;
		uniform mat4 uViewMatrix;
		uniform mat4 uProjMatrix;

		out lowp vec2 vTextureCoord;
		out lowp vec4 vColor;

		void main(void) {
			gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
			vTextureCoord = aTextureCoord;
			vColor = aVertexColor;
		}
    `;
	// Fragment shader. Called for every pixel on each shape to be drawn. Color.
	const fsSource = `#version 300 es
		precision lowp float;

		in vec2 vTextureCoord;
		in vec4 vColor;

		uniform sampler2D uSampler;

		out vec4 fragColor;

		void main(void) {
			// Apply a LOD bias of -0.5 to the texture lookup
			fragColor = texture(uSampler, vTextureCoord, -0.5) * vColor;
		}
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
			color: gl.getAttribLocation(program, 'aVertexColor')
		},
		uniformLocations: {
			projMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
			viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
			worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix'),
			uSampler: gl.getUniformLocation(program, 'uSampler')
		},
	};
}

/**
 * Creates and return a shader program that is capable of rendering meshes
 * with a bound texture AND with a global color tint applied to every point.
 * @returns {ShaderProgram}
*/
function createTintedTextureProgram() {
	// Vertex shader. For every vertex, applies matrix multiplication to find it's position on the canvas.
	// Attributes receive data from buffer. Uniforms are like global variables, they stay the same.
	const vsSource = `  
        attribute vec4 aVertexPosition;
        attribute vec2 aTextureCoord;

        uniform mat4 uWorldMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjMatrix;

        varying lowp vec2 vTextureCoord;

        void main(void) {
            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord;
        }
    `;
	// Fragment shader. Called for every pixel on each shape to be drawn. Color.
	const fsSource = `
        varying lowp vec2 vTextureCoord;

        uniform lowp vec4 uTintColor;
        uniform sampler2D uSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord) * uTintColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	/** @type {ShaderProgram} */
	const tintedTextureProgram = {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
		},
		uniformLocations: {
			tintColor: gl.getUniformLocation(program, 'uTintColor'),
			projMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
			viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
			worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix'),
			uSampler: gl.getUniformLocation(program, 'uSampler')
		},
	};

	// Set a default color of WHITE for the uVertexColor uniform.
	// Otherwise, if we forget to set it when rendering, the pieces will be invisible,
	// and you will have no clue why and spend 30 minutes trying to figure it out.
	gl.useProgram(tintedTextureProgram.program);
	const defaultColor = [1,1,1, 1]; // White
	gl.uniform4fv(tintedTextureProgram.uniformLocations.uVertexColor, defaultColor);

	return tintedTextureProgram;
}
/**
 * Creates an actual program from the provided vertex shader and fragment shader source codes
 * in which our webgl context can switch to via gl.useProgram() before rendering.
 * @param {string} vsSourceText - The vertex shader source code, in GLSL version 1.00
 * @param {string} fsSourceText - The fragment shader source code, in GLSL version 1.00
 * @returns {WebGLProgram} The program
 */
function createShaderProgram(vsSourceText, fsSourceText) { // source texts: vertex shader, fragment shader

	const vertexShader = createShader(gl.VERTEX_SHADER, vsSourceText);
	const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSourceText);

	// Create the shader program
	const shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	// If creating the shader program failed, alert
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert(`${translations.shaders_failed} ${gl.getProgramInfoLog(shaderProgram)}`);
		return null;
	}

	return shaderProgram;
}

/**
 * Creates a shader of the given type, from the specified source code.
 * @param {number} type - `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`
 * @param {string} sourceText - The shader source code, in GLSL version 1.00
 * @returns {WebGLShader} The shader
 */
function createShader(type, sourceText) { // type: gl.VERTEX_SHADER / gl.FRAGMENT_SHADER
	const shader = gl.createShader(type);
	gl.shaderSource(shader, sourceText); // Send the source to the shader object
	gl.compileShader(shader); // Compile the shader program

	// Check if it compiled successfully
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const error = `${translations.failed_compiling_shaders} ${gl.getShaderInfoLog(shader)}`;
		alert(error);
		console.error(error);
		gl.deleteShader(shader);
		return null;
	}
    
	return shader;
}


/**
 * Picks a compatible shader that will work with all the provided attributes and uniforms.
 * 
 * Uniforms you NEVER have to provide are [projMatrix, viewMatrix, worldMatrix, uSampler],
 * because those are either present in every shader already, OR the uSampler uniform
 * is assumed if you're using the 'texcoord' attribute.
 * 
 * An example of a uniform you WOULD specify is 'tintColor'.
 * 
 * @param {string[]} attributes - A list of all attributes we need to use. (e.g. `['position','color']` for vertex data that doesn't use a texture)
 * @param {string[]} [uniforms] - Optional. Only provide if you need to use a uniform that is not one of the assumed [projMatrix, viewMatrix, worldMatrix, uSampler]
 */
function shaderPicker(attributes, uniforms = []) {

	let compatibleShaders = Object.values(programs);

	// Iterate through all existing shaders, check to see if they support each of our attributes and uniforms.
	attributes.forEach((attrib) => {
		compatibleShaders = compatibleShaders.filter((program) => program.attribLocations[attrib] !== undefined);
	});
	uniforms.forEach((uniform) => {
		compatibleShaders = compatibleShaders.filter((program) => program.uniformLocations[uniform] !== undefined);
	});

	if (compatibleShaders.length === 0) throw new Error(`Cannot find a shader compatible with the requested attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}`);

	// What if there are multiple shaders compatible?
	// Use the least complex one (lowest number of attributes and uniforms)

	const leastComplexShader = compatibleShaders.reduce((leastComplex, current) => {
		const leastComplexComplexity = getShaderComplexity(leastComplex);
		const currentComplexity = getShaderComplexity(current);
		if (leastComplexComplexity === currentComplexity) throw new Error(`Shaders have the same level of complexity, can't pick which one to use! Requested attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}`);
		return currentComplexity < leastComplexComplexity;
	});

	console.log(`Chose shader with attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}\nTo use for requested attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}`);

	return leastComplexShader;
}

function getShaderComplexity(program) {
	return Object.keys(program.attribLocations).length + Object.keys(program.uniformLocations).length;
}



export default {
	initPrograms,
	programs,
	shaderPicker,
	manualUniforms,
};