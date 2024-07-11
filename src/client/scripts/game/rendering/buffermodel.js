
// This script contains all the functions used to generate renderable buffer models of the
// game objects that the shader programs can use. It receives the object's vertex data to do so.

"use strict";

const buffermodel = (function() {

    /** Valid primitives to render. */
    const validRenderModes = ["TRIANGLES", "TRIANGLE_STRIP", "TRIANGLE_FAN", "POINTS", "LINE_LOOP", "LINE_STRIP", "LINES"];
    /** The draw hint when creating buffers on the gpu. Supposedly, dynamically
     * choosing which hint based on your needs offers very minor performance improvement.
     * Can choose between `gl.STATIC_DRAW`, `gl.DYNAMIC_DRAW`, or `gl.STREAM_DRAW` */
    const DRAW_HINT = "STATIC_DRAW"


    // Functions for creating buffer models...

    /**
     * Creates a renderable colored buffer model from vertex data with stride length 6-7 (2-3 vertex points, 4 color values).
     * @param {Float32Array} data - The vertex data of the mesh. Each vertex should have 2-3 numbers for position and 4 numbers for the color.
     * @param {number} numPositionComponents - The number of floats for each vertice's position, either 2 or 3.
     * @param {string} mode - The primitive rendering mode to use (e.g. "TRIANGLES" / "POINTS"), see {@link validRenderModes}
     * @returns {BufferModel} The buffer model
     */
    function createModel_Colored(data, numPositionComponents, mode) {
        if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`)
        const stride = numPositionComponents + 4;
        const prepDrawFunc = getPrepDrawFunc(shaders.programs.colorProgram, numPositionComponents, false, true);
        return new BufferModel(shaders.programs.colorProgram, data, stride, mode, undefined, prepDrawFunc)
    }

    /**
     * Creates a renderable textured buffer model from vertex data with stride
     * length 4-5 (2-3 vertex points, 2 texture coords), and a specified texture.
     * @param {Float32Array} data - The vertex data of the mesh. Each vertex should have 2-3 numbers for position and 2 numbers for texture coords.
     * @param {number} numPositionComponents - The number of floats for each vertice's position, either 2 or 3.
     * @param {string} mode - The primitive rendering mode to use (e.g. "TRIANGLES" / "POINTS"), see {@link validRenderModes}
     * @param {Object} texture - The texture to bind before rendering (this can be changed by calling changeTexture())
     * @returns {BufferModel} The buffer model
     */
    function createModel_Textured(data, numPositionComponents, mode, texture) {
        if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`)
        if (texture == null) return console.error("Cannot create a textured buffer model without a texture!")
        const stride = numPositionComponents + 2;
        const prepDrawFunc = getPrepDrawFunc(shaders.programs.textureProgram, numPositionComponents, true, false);
        return new BufferModel(shaders.programs.textureProgram, data, stride, mode, texture, prepDrawFunc)
    }

    /**
     * Creates a renderable colored-textured buffer model from vertex data with stride
     * length 8-9 (2-3 vertex points, 2 texture coords, 4 color values), and a specified texture.
     * @param {Float32Array} data - The vertex data of the mesh. Each vertex should have 2-3 numbers for position, 2 numbers for texture coords, and 4 numbers for the color.
     * @param {number} numPositionComponents - The number of floats for each vertice's position, either 2 or 3.
     * @param {string} mode - The primitive rendering mode to use (e.g. "TRIANGLES" / "POINTS"), see {@link validRenderModes}
     * @param {Object} texture - The texture to bind before rendering (this can be changed by calling changeTexture())
     * @returns {BufferModel} The buffer model
     */
    function createModel_ColorTextured(data, numPositionComponents, mode, texture) {
        if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`)
        if (texture == null) return console.error("Cannot create a textured buffer model without a texture!")
        const stride = numPositionComponents + 6;
        const prepDrawFunc = getPrepDrawFunc(shaders.programs.coloredTextureProgram, numPositionComponents, true, true);
        return new BufferModel(shaders.programs.coloredTextureProgram, data, stride, mode, texture, prepDrawFunc)
    }

    /**
     * Creates a renderable tinted-textured buffer model from vertex data with stride
     * length 4-5 (2-3 vertex points, 2 texture coords), and a specified texture.
     * The tint can be specified by passing in the custom uniform value as a paramter in the render() method.
     * @param {Float32Array} data - The vertex data of the mesh. Each vertex should have 2-3 numbers for position, and 2 numbers for texture coords.
     * @param {number} numPositionComponents - The number of floats for each vertice's position, either 2 or 3.
     * @param {string} mode - The primitive rendering mode to use (e.g. "TRIANGLES" / "POINTS"), see {@link validRenderModes}
     * @param {Object} texture - The texture to bind before rendering (this can be changed by calling changeTexture())
     * @returns {BufferModel} The buffer model
     */
    function createModel_TintTextured(data, numPositionComponents, mode, texture) {
        if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`)
        if (texture == null) return console.error("Cannot create a tinted textured buffer model without a texture!")
        const stride = numPositionComponents + 2;
        const prepDrawFunc = getPrepDrawFunc(shaders.programs.tintedTextureProgram, numPositionComponents, true, false);
        return new BufferModel(shaders.programs.tintedTextureProgram, data, stride, mode, texture, prepDrawFunc)
    }

    /**
     * Returns the prepDraw function the buffer model can call right before rendering
     * to tell the gpu how it's going to extract the vertex data into the shader attributes.
     * @param {ShaderProgram} shaderProgram - The target shader program.
     * @param {number} numPositionComponents - The number of floats for each vertice's position, either 2 or 3.
     * @param {boolean} usingTextureCoords - Whether the vertex data specifies texture coordinates.
     * @param {boolean} usingColorValues - Whether the vertex data specifies color values.
     * @returns {Function} The prepDraw function
     */
    function getPrepDrawFunc(shaderProgram, numPositionComponents, usingTextureCoords, usingColorValues) {
        /**
         * Tells the gpu how it's going to extract the vertex data
         * from the buffer into the shader attributes before rendering.
         * @param {WebGLBuffer} buffer - The buffer containing our vertex data.
         * @param {number} stride - The stride length of the data, or how many floats each vertex uses to describe its position, texture, and color data.
         * @param {BYTES_PER_ELEMENT} The number of bytes per element of the data array.
         */
        return function(buffer, stride, BYTES_PER_ELEMENT) {
            gl.useProgram(shaderProgram.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            const stride_bytes = stride * BYTES_PER_ELEMENT; // # bytes in each vertex/line.
            let current_offset_bytes = 0; // how many bytes inside the buffer to start from.

            // Tell WebGL how to pull out the positions from the position buffer into the vertexPosition attribute.
            initAttribute(shaderProgram.attribLocations.vertexPosition, stride_bytes, numPositionComponents, current_offset_bytes)
            current_offset_bytes += numPositionComponents * BYTES_PER_ELEMENT;

            if (usingTextureCoords) { // Tell WebGL how to pull out the texture coords
                // HERE is where I would bind another buffer if I kept the
                // coordinate data and texture data in separate buffers!
                const numComponents = 2;
                initAttribute(shaderProgram.attribLocations.textureCoord, stride_bytes, numComponents, current_offset_bytes)
                current_offset_bytes += numComponents * BYTES_PER_ELEMENT;
            }
            if (usingColorValues) { // Tell WebGL how to pull out the color
                const numComponents = 4;
                initAttribute(shaderProgram.attribLocations.vertexColor, stride_bytes, numComponents, current_offset_bytes)
                current_offset_bytes += numComponents * BYTES_PER_ELEMENT
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
    }

    /**
     * Tells WebGL how it's going to pull out the vertex data from the mesh
     * and into the specified attribute, then enables the attribute for use.
     * @param {number} attribLocation - The location of the attribute in the shader program.
     * @param {number} stride_bytes - The stride, in bytes, between each vertex.
     * @param {number} numComponents - The number of components for this attribute per vertex.
     * @param {number} offset - The offset, in bytes, from the start of each vertice's data to the first component of this attribute.
     */
    function initAttribute(attribLocation, stride_bytes, numComponents, offset) { // Attribute location (shaders.programs.textureProgram.attribLocations.vertexPosition), 
        const type = gl.FLOAT;    // the data in the buffer is 32bit floats
        const normalize = false;
        gl.vertexAttribPointer(attribLocation, numComponents, type, normalize, stride_bytes, offset);
        // Enables the attribute for use
        gl.enableVertexAttribArray(attribLocation);
    }

    /**
     * Renders the currently bound buffer. Called from within each buffer model's render() function.
     * This assumes the model has already called prepDraw() to prepare for rendering.
     * @param {ShaderProgram} program - The shader program
     * @param {number[]} [position] The positional translation: `[x,y,z]`
     * @param {number[]} [scale] The scale transformation: `[x,y,z]`
     * @param {number} vertexCount - The mesh's vertex count
     * @param {string} mode - Primitive rendering mode (e.g. "TRIANGLES" / "LINES"). See {@link validRenderModes}.
     * @param {Object} [texture] The texture to bind, if applicable.
     * @param {Object[]} [customUniformValues] An object that contains custom uniform values: `{ name: value }`
     */
    function renderPreppedModel(program, position = [0,0,0], scale = [1,1,1], vertexCount, mode, texture, customUniformValues = {}) {
        // Create new identity worldMatrix dependent on our board position and scale.
        const worldMatrix = mat4.create();
        mat4.scale(worldMatrix, worldMatrix, scale)
        mat4.translate(worldMatrix, worldMatrix, position)

        // Update the world matrix on our shader program, translating our models into the correct position.
        gl.uniformMatrix4fv(program.uniformLocations.worldMatrix, gl.FALSE, worldMatrix);

        // Send any custom-provided uniform values over to the gpu now!
        for (const key in customUniformValues) { sendCustomUniformToGPU(program, key, customUniformValues[key]) }

        // CAN ENABLE in the future if we want to render with multiple textures in one mesh.
        // A custom shader has to be written that has multiple uSampler uniforms.
        // The active texture unit is 0 by default, but needs to be set before you bind each texture,
        // and then you must tell the GPU what texture unit each uSampler is bound to.
        // gl.activeTexture(gl.TEXTURE0);
        if (texture) gl.bindTexture(gl.TEXTURE_2D, texture);
        // Tell the shader we bound the texture to texture unit 0
        // gl.uniform1i(program.uniformLocations.uSampler, 0);
        // sendCustomUniformToGPU(program, 'uSampler', 0); // Alernate line that does the exact same

        // Call the draw function!
        const offset = 0; // How many points of the model to skip.
        gl.drawArrays(gl[mode], offset, vertexCount);

        if (texture) gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * Sends a custom-specified uniform to the gpu before rendering.
     * ASSUMES the provided program has been set already with gl.useProgram()!
     * @param {ShaderProgram} program - The shader program
     * @param {string} name - The name of the uniform, for example, `uVertexColor`.
     * @param {number[] | Float32Array | number} value - The value of the uniform, for example, `[1,0,0,1]`.
     */
    function sendCustomUniformToGPU(program, name, value) {
        const type = getUniformValueType(value); // array / matrix
        const method = getUniformMethodForValue(type, value); // uniform4fv()
        if (type === 'matrix') {
            const transpose = false;
            return gl[method](program.uniformLocations[name], transpose, value);
        }
        gl[method](program.uniformLocations[name], value)
    }
    
    /**
     * Determines the appropriate WebGL uniform-update method for the provided uniform value.
     * @param {string} type - The type of the uniform, `array` / `matrix` / `number`.
     * @param {Array | Float32Array | number} value - The value of the uniform.
     * @returns {string} The WebGL method string required to update the uniform value. For example, `uniform4fv`.
     */
    function getUniformMethodForValue(type, value) {
        switch (type) {
            case 'array':
                return getArrayUniformMethod(value);
            case 'matrix':
                return getMatrixUniformMethod(value);
            case 'number':
                return 'uniform1i';
            default:
                console.error(`Unsupported uniform type ${type}.`)
        }
    }

    /**
     * Determines the appropriate WebGL uniform-update method for an array uniform value.
     * @param {Array} value - The array value of the uniform.
     * @returns {string} The WebGL method string required to update the array uniform value. For example, `uniform4v`.
     */
    function getArrayUniformMethod(value) {
        const length = value.length;
        if (length > 4 || length === 0) return console.error(`Unsupported array length ${length} for uniform value.`)
        return `uniform${length}fv`; // uniform4fv
    }

    /**
     * Determines the appropriate WebGL uniform-update method for a matrix uniform value.
     * @param {Float32Array} value - The matrix value of the uniform.
     * @returns {string} The WebGL method string required to update the matrix uniform value. For example, `uniformMatrix4fv`.
     */
    function getMatrixUniformMethod(value) {
        const length = value.length;
        switch (length) {
            case 4:
                return 'uniformMatrix2fv';
            case 9:
                return 'uniformMatrix3fv';
            case 16:
                return 'uniformMatrix4fv';
            default:
                console.error(`Unsupported matrix size ${length} for uniform value.`);
        }
    }

    /**
     * Determines the type of the uniform value.
     * @param {*} value - The value of the uniform.
     * @returns {string} The type of the uniform value, `array`, or `matrix`.
     */
    function getUniformValueType(value) {
        if      (Array.isArray(value))          return 'array';
        else if (value instanceof Float32Array) return 'matrix';
        else if (typeof value === 'number')     return 'number';
        console.error(`Unsupported uniform value type ${typeof value}.`)
    }

    return Object.freeze({
        validRenderModes,
        DRAW_HINT,
        createModel_Textured,
        createModel_Colored,
        createModel_ColorTextured,
        createModel_TintTextured,
        renderPreppedModel
    })

})();



/**
 * The **universal** create buffer model constructor. Use the *new* keyword. Creates a renderable buffer model from the provided information.
 * 
 * This is in the public scope so that the {@link BufferModel} type is available to all,
 * but only the {@link buffermodel} script should call this.
 * @param {ShaderProgram} program - The shader program to be used when rendering this model
 * @param {Float32Array} data - The source float32array of the vertex data of the mesh
 * @param {number} stride - The stride of the data, or, how many floats per vertex. (If each vertex has 2 values for the position and 2 for the texture coords, then the stride would be 4)
 * @param {string} mode - The primitive rendering mode (e.g. "TRIANGLES" / "POINTS"), see {@link buffermodel.validRenderModes}.
 * @param {Object} [texture] - The texture to bind during rendering, if applicable.
 * @param {Function} prepDrawFunc - The function to call before rendering that informs the gpu how it's going to extract the values out of each vertex into our attributes.
 * @returns {BufferModel} The buffer model, ready to be rendered!
 */
function BufferModel(program, data, stride, mode, texture, prepDrawFunc) { // data: Float32Array
    if (!math.isFloat32Array(data)) return console.error("Cannot create a buffer model without a Float32Array!");
    // Make sure the length of our data looks good (divisible by the stride)
    if (data.length % stride !== 0) return console.error("Data length is not divisible by stride when generating a buffer model! Perhaps did you pass in the wrong numPositionComponents, or use the wrong constructor?")
    if (!buffermodel.validRenderModes.includes(mode)) return console.error(`Mode "${mode}" is not an accepted value!`)
    
    /** A reference to the vertex data, stored as a float32array, that went into this model's buffer.
     * If this is modified, we can use updateBuffer() or updateBufferIndices() to pass those changes
     * on to the gpu, without having to create a new buffer model.
     * @type {Float32Array} */
    this.data = data;

    const vertexCount = data.length / stride;
    let textureToRender = texture;

    const buffer = gl.createBuffer(); // Create an empty buffer for the model's vertex data.
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); // Bind the buffer before we work with it. This is pretty much instantaneous no matter the buffer size.
    // Copy our vertex data into the buffer.
    // When copying over massive amounts of data (like millions of floats),
    // this FREEZES the screen for a moment before unfreezing. Not good for user experience!
    // When this happens, create smaller meshes.
    // And always modify the buffer data on the gpu directly when you can, to avoid having to create another model!
    gl.bufferData(gl.ARRAY_BUFFER, data, gl[buffermodel.DRAW_HINT]);
    gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind the buffer


    /** Call when you need to reinit the model because the source float32array has new data.
     * This is faster than creating a whole new model, but it still may be slow for very large data amounts. */
    this.updateBuffer = function() { // Float32Array
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        // gl.bufferData(gl.ARRAY_BUFFER, data, gl[DRAW_HINT]); // OLD. SLOW
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); // NEW. Sometimes faster? It stops being fast when I rewind & forward the game.
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    /**
     * **Call this** when you update specific vertex data within the source float32array!
     * FAST. Prevents you having to create a whole new model!
     * For example, when a single piece in the mesh moves.
     * @param {number} changedIndicesStart - The index in the vertex data marking the first value changed.
     * @param {number} changedIndicesCount - The number of indices in the vertex data that were changed, beginning at {@link changedIndicesStart}.
     */
    this.updateBufferIndices = function(changedIndicesStart, changedIndicesCount) {
        const endIndice = changedIndicesStart + changedIndicesCount - 1;
        if (endIndice > data.length - 1) return console.error("Cannot update buffer indices when they overflow the data.")

        // Calculate the byte offset and length based on the changed indices
        const offsetInBytes = changedIndicesStart * data.BYTES_PER_ELEMENT;

        // Update the specific portion of the buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, offsetInBytes, data.subarray(changedIndicesStart, changedIndicesStart + changedIndicesCount));
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    /**
     * Supposedly, deletes the buffer holding the vertex data.
     * This is DANGEROUS to call as it creates bugs with the board backdrop not rendering.
     * ChatGPT SAYS this is good practice to avoid memory leaks and free up resources...
     * So this would be called before you delete this model in javascript!.
     */
    this.deleteBuffer = function() { gl.deleteBuffer(buffer); }

    /** 
     * **Renders** the buffer model! Translates and scales according to the provided arguments.
     * Applies any custom uniform values before rendering.
     * @param {number[]} position - The positional translation
     * @param {number[]} scale - The scaling transformation
     * @param {Object} [customUniformValues] - If applicable, an object containing any custom uniform values. For example, `{ uVertexColor: [1,0,0,1] }` - This particular uniform is used for the tintedTextureProgram.
     */
    this.render = function(position, scale, customUniformValues) { // [0,0,0], [1,1,1]  Can be undefined, render will use defaults.
        // Must be called before every time we render the model.
        // Tell gl which shader program to use, how it's going to extract the positions from the model and pass into the shader, and bind the buffer model.
        prepDrawFunc(buffer, stride, data.BYTES_PER_ELEMENT); // This also binds the buffer before rendering
        buffermodel.renderPreppedModel(program, position, scale, vertexCount, mode, textureToRender, customUniformValues)
    }

    /**
     * Returns the primitive rendering mode set when this buffer model was created (i.e. "TRIANGLES" / "POINTS"), see {@link buffermodel.validRenderModes}.
     * @returns {string} The mode */
    this.getMode = function() { return mode };

    /** Returns the stride of the source vertex data, or how many components makes up each vertex. 
     * @returns {number} The stride */
    this.getStride = function() { return stride; }

    if (textureToRender) { // Include changeTexture() if this model uses a texture.
        /** Swaps out the texture that will be bound when rendering this buffer model.
         * @param {Object} newTexture - The new texture object */
        this.changeTexture = function changeTexture(newTexture) { textureToRender = newTexture; };
    }
}