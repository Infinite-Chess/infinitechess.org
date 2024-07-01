
/**
 * This script stores our global WebGL rendering context,
 * and other utility methods.
 */

/**
 * The WebGL rendering context. This is our web-based render engine.
 * @type {WebGLRenderingContext}
 */
let gl; // The WebGL context. Is initiated in initGL()

const webgl = (function() {

    /**
     * The color the screen should be cleared to every frame.
     * This can be changed to give the sky a different color.
     */
    let clearColor = [0.5, 0.5, 0.5] // Grey

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
    const defaultDepthFuncParam = 'LEQUAL'

    /**
     * Whether or not to use WebGL2 if it's compatible. It is backwards compatible.
     * 
     * WebGL2 is not supported on Safari. Let's just use WebGL1 to avoid incompatibility with browsers.
     */
    const useWebGL2 = false;

    /**
     * Whether or not to cull (skip) rendering back faces.
     * We can prevent the rasteurizer from calculating pixels on faces facing AWAY from us with backface culling.
     * 
     * IF WE AREN'T CAREFUL about all vertices going into the same clockwise/counterclockwise
     * direction, then some objects will be invisible!
     */
    const culling = false;
    /**
     * If true, whether or not a face is determined as a front face depends
     * on whether it's vertices move in a clockwise direction, otherwise counterclockwise.
     */
    const frontFaceVerticesAreClockwise = true;


    /**
     * Sets the color the screen will be cleared to every frame.
     * 
     * This is useful for changing the sky color.
     * @param {number[]} newClearColor - The new clear color: `[r,g,b]`
     */
    function setClearColor(newClearColor) { clearColor = newClearColor;  }

    /**
     * Initiate the WebGL context. This is our web-based render engine.
     */
    function init() {
        if (useWebGL2) {
            // Without alpha in the options, shading yields incorrect colors! This removes the alpha component of the back buffer.
            gl = camera.canvas.getContext('webgl2', { alpha: false })
            if (!gl) console.log("Browser doesn't support WebGL-2, falling back to WebGL-1.")
        }
        if (!gl) { // Init WebGL-1
            gl = camera.canvas.getContext('webgl', { alpha: false })
        }
        if (!gl) { // Init WebGL experimental
            console.log("Browser doesn't support WebGL-1, falling back on experiment-webgl.")
            gl = canvas.getContext('experimental-webgl', { alpha: false});
        }
        if (!gl) { // Experimental also failed to init
            alert("Your browser does not support WebGL. This game requires that to function. Please update your browser.")
            throw new Error("WebGL not supported.")
        }
    
        gl.clearDepth(1.0); // Set the clear depth value
        clearScreen()

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl[defaultDepthFuncParam]);

        gl.enable(gl.BLEND);
        toggleNormalBlending()

        if (culling) {
            gl.enable(gl.CULL_FACE);
            const dir = frontFaceVerticesAreClockwise ? gl.CW : gl.CCW
            gl.frontFace(dir); // Specifies what faces are considered front, depending on their vertices direction.
            gl.cullFace(gl.BACK); // Skip rendering back faces. Alertnatively we could skip rendering FRONT faces.
        }
    }

    /**
     * Clears color buffer and depth buffers.
     * Needs to be called every frame.
     */
    function clearScreen() {
        gl.clearColor(...clearColor,  1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    /**
     * Toggles normal blending mode. Transparent objects will correctly have
     * their color shaded onto the color behind them.
     */
    function toggleNormalBlending() { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA) }

    /**
     * Toggles inverse blending mode, which will negate any color currently in the buffer.
     * 
     * This is useful for rendering crosshairs, because they will appear black on white backgrounds,
     * and white on black backgrounds.
     */
    function toggleInverseBlending() { gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.GL_ZERO) }

    /**
     * Executes a function (typically a render function) while the depth function paramter
     * is `ALWAYS`. Objects will be rendered no matter if they are behind or on top of other objects.
     * This is useful for preventing tearing when objects are on the same z-level in perspective.
     * @param {Function} func 
     */
    function executeWithDepthFunc_ALWAYS(func) {
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
     * @param {Function} func 
     */
    function executeWithInverseBlending(func) {
        toggleInverseBlending();
        func();
        toggleNormalBlending();
    }

    /**
     * Queries common WebGL context values and logs them to the console.
     * Each user device may have different supported values.
     * @param {WebGLRenderingContext} gl - The WebGL context.
     */
    function queryWebGLContextInfo() {
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
            { name: 'MAX_SAMPLES', desc: 'Maximum samples', guaranteed: 4 },
        ];

        console.log('WebGL Context Information:');
        params.forEach(param => {
            const value = gl.getParameter(gl[param.name]);
            console.log(`${param.desc}:`, value, `(Guaranteed: ${param.guaranteed})`);
        });
    }

    return Object.freeze({
        init,
        clearScreen,
        executeWithDepthFunc_ALWAYS,
        executeWithInverseBlending,
        setClearColor,
        queryWebGLContextInfo
    })
})()