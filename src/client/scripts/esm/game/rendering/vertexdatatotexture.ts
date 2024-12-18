
/**
 * Converts a shape, from its vertex data, to a renderable webgl texture.
 * @param gl - The webgl rendering context
 * @param vertexData - The vertex data of the shape to create a texture from. Stride length 6 (2 position, 4 color).
 * The positional data should be between 0-1
 * @returns The renderable webgl texture
 */
function convertVertexDataToTexture(gl: WebGL2RenderingContext, vertexData: number[]}): WebGLTexture {
    const stride = 6; // Each vertex has 2 values for the x & y position, and 4 for the color
    const resolution = 500; // 500px by 500px

    if (vertexData.length % stride !== 0) throw new Error('Vertex data not divisible by stride when converting to texture.');

    // Create and bind a framebuffer
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // Create a texture to render to
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, resolution, resolution, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.generateMipmap(gl.TEXTURE_2D);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); // DEFAULT if not set. Jagged edges, mipmap interpollation (never blurry, though always jaggy)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // Smooth edges, mipmap interpollation (half-blurry all the time, EXCEPT with LOD bias)
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); // Smooth edges, mipmap snapping (clear on some zoom levels, full blurry at others)
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST); // Jagged edges, mipmap snapping (jagged all the time)

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // Magnification, smooth edges (noticeable when zooming in)


    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Attach the texture to the framebuffer
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Check framebuffer completeness
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Framebuffer is not complete");
    }

    // Create and bind a vertex buffer
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW);

    // Assume shaders and program are already set up
    // Attributes: aPosition (vec2) at location 0, aColor (vec4) at location 1
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride * Float32Array.BYTES_PER_ELEMENT, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(1);

    // Set viewport to match the texture resolution
    gl.viewport(0, 0, resolution, resolution);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // Clear and render the shape to the texture
    gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent background
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 6);

    // Generate mipmaps
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Unbind framebuffer to return to default rendering
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Return the generated texture
    return texture;
}

export { convertVertexDataToTexture }