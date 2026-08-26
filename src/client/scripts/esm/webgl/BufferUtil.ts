// src/client/scripts/esm/webgl/BufferUtil.ts

/**
 * GPU buffers: creating one from vertex data, and rewriting a slice of one in place.
 */

// Types -----------------------------------------------------------------------

/**
 * All signed type arrays compatible with WebGL, that can be used as vertex data.
 *
 * Float32Array => Max safe integer: 16,777,215. Max value: 3.4e+38
 * Int32Array => Max integer: 2,147,483,647
 * Int16Array => Max integer: 32,767
 * Int8Array => Max integer: 127
 */
export type TypedArray = Float32Array | Int32Array | Int16Array | Int8Array;

// Variables -------------------------------------------------------------------

/** The draw hint when creating buffers on the gpu. Supposedly, dynamically
 * choosing which hint based on your needs offers very minor performance improvement.
 * Can choose between `gl.STATIC_DRAW`, `gl.DYNAMIC_DRAW`, or `gl.STREAM_DRAW` */
const DRAW_HINT = 'STATIC_DRAW';

// Functions -------------------------------------------------------------------

/**
 * Updates only the provided indices of a buffer on the GPU with new data.
 * FAST. Use if only a part of the mesh has changed.
 * @param buffer - The WebGL buffer to update.
 * @param data - The typed array containing the new data (e.g., Float32Array, Int16Array).
 * @param changedIndicesStart - The index in the vertex data marking the first value changed.
 * @param changedIndicesCount - The number of indices in the vertex data that were changed, beginning at {@link changedIndicesStart}.
 */
function updateBufferIndices(
	gl: WebGL2RenderingContext,
	buffer: WebGLBuffer,
	data: TypedArray,
	changedIndicesStart: number,
	changedIndicesCount: number,
): void {
	const endIndice = changedIndicesStart + changedIndicesCount - 1;
	if (endIndice > data.length - 1) {
		return console.error(
			`Cannot update buffer indices when they overflow the data. Data length: ${data.length}, changedIndicesStart: ${changedIndicesStart}, changedIndicesCount: ${changedIndicesCount}, endIndice: ${endIndice}`,
		);
	}

	// Calculate the byte offset and length based on the changed indices
	const offsetInBytes = changedIndicesStart * data.BYTES_PER_ELEMENT;

	// Update the specific portion of the buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferSubData(
		gl.ARRAY_BUFFER,
		offsetInBytes,
		data.subarray(changedIndicesStart, changedIndicesStart + changedIndicesCount),
	);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

/**
 * Creates a WebGL buffer from the provided Float32Array data and binds it to the ARRAY_BUFFER target.
 * The buffer is populated with the data and then unbound.
 * @param data - The vertex data to be copied into the buffer.
 * @returns The created WebGL buffer.
 */
function createBufferFromData(gl: WebGL2RenderingContext, data: TypedArray): WebGLBuffer {
	const buffer = gl.createBuffer()!; // Create an empty buffer for the model's vertex data.
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer); // Bind the buffer before we work with it. This is pretty much instantaneous no matter the buffer size.
	// Copy our vertex data into the buffer.
	// When copying over massive amounts of data (like millions of floats),
	// this FREEZES the screen for a moment before unfreezing. Not good for user experience!
	// When this happens, work with smaller meshes.
	// And always modify the buffer data on the gpu directly when you can,
	// using updateBufferIndices(), to avoid having to create another model!
	gl.bufferData(gl.ARRAY_BUFFER, data, gl[DRAW_HINT]);
	gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind the buffer

	return buffer;
}

export { updateBufferIndices, createBufferFromData };
