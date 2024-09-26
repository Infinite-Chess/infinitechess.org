
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
     * Set the tint by updating the uniform `uVertexColor` before rendering by using gl.uniform4fv(),
     * or just by sending the uniform value into {@link BufferModel.render}
     * @type {ShaderProgram}
     */
    tintedTextureProgram: undefined, // Renders textures with color
};

/** Initiates the shader programs we will be using.
 * Call this after initiating the webgl context. */
function initPrograms() {
    programs.colorProgram = createColorProgram();
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
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
            vertexColor: gl.getAttribLocation(program, 'aVertexColor')
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
            viewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
            worldMatrix: gl.getUniformLocation(program, 'uWorldMatrix')
        },
    };
}

/**
 * Creates and return a shader program that is
 * capable of rendering meshes with a bound texture.
 * @returns {ShaderProgram}
*/
function createTextureProgram() {
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
            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition; // Original, no z-translating
            vTextureCoord = aTextureCoord;
        }
    `;
    // Fragment shader. Called for every pixel on each shape to be drawn. Color.
    const fsSource = `
        varying lowp vec2 vTextureCoord;

        uniform sampler2D uSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord);
        }
    `;

    // ALTERNATIVE shader code that uses version 3! ONLY compatible with WebGL-2, which safari doesn't support!
    // const vsSource = `#version 300 es

    //     in vec4 aVertexPosition;
    //     in vec2 aTextureCoord;
        
    //     uniform mat4 uWorldMatrix;
    //     uniform mat4 uViewMatrix;
    //     uniform mat4 uProjMatrix;
        
    //     out lowp vec2 vTextureCoord;
        
    //     void main(void) {
    //         gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
    //         vTextureCoord = aTextureCoord;
    //     }
    // `;
    // const fsSource = `#version 300 es

    //     precision mediump float;

    //     in lowp vec2 vTextureCoord;

    //     uniform sampler2D uSampler;

    //     out vec4 fragColor;

    //     void main(void) {
    //         fragColor = texture(uSampler, vTextureCoord);
    //     }
    // `;

    const program = createShaderProgram(vsSource, fsSource);

    return {
        program,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
            textureCoord: gl.getAttribLocation(program, 'aTextureCoord'),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
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
    const vsSource = `
        attribute vec4 aVertexPosition;
        attribute vec2 aTextureCoord;
        attribute vec4 aVertexColor;

        uniform mat4 uWorldMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjMatrix;

        varying lowp vec2 vTextureCoord;
        varying lowp vec4 vColor;

        void main(void) {
            gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord;
            vColor = aVertexColor;
        }
    `;
    // Fragment shader. Called for every pixel on each shape to be drawn. Color.
    const fsSource = `
        varying lowp vec2 vTextureCoord;
        varying lowp vec4 vColor;

        uniform sampler2D uSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;
        }
    `;

    const program = createShaderProgram(vsSource, fsSource);

    return {
        program,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
            textureCoord: gl.getAttribLocation(program, 'aTextureCoord'),
            vertexColor: gl.getAttribLocation(program, 'aVertexColor')
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
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

        uniform lowp vec4 uVertexColor;
        uniform sampler2D uSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord) * uVertexColor;
        }
    `;

    const program = createShaderProgram(vsSource, fsSource);

    /** @type {ShaderProgram} */
    const tintedTextureProgram = {
        program,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
            textureCoord: gl.getAttribLocation(program, 'aTextureCoord'),
        },
        uniformLocations: {
            uVertexColor: gl.getUniformLocation(program, 'uVertexColor'),
            projectionMatrix: gl.getUniformLocation(program, 'uProjMatrix'),
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

export default {
    initPrograms,
    programs
};