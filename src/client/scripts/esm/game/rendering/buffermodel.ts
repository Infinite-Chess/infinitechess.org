
// @ts-ignore
import shaders, { ShaderProgram } from './shaders.js';
// @ts-ignore
import { gl } from './webgl.js';
// @ts-ignore
import mat4 from './gl-matrix.js';
// @ts-ignore
import camera from './camera.js';
import { createBufferFromData, updateBufferIndices } from './buffers.js';

"use strict";


// Type Definitions -----------------------------------------------------------------------


/** An object describing a single attribute inside our vertex data, and how many components it has per stride/vertex. */
interface Attribute {
	/** The name of the attribute. */
	name: 'position' | 'texcoord' | 'color';
	/** How many values the attribute has in a single stride/vertex of our data array. */
	numComponents: number
};

/** An object containing all attributes that some vertex data contains. */
type AttributeInfo = Attribute[];

/** A renderable model. */
type BufferModel = {
	/** A reference to the vertex data, stored in a Float32Array, that went into this model's buffer.
     * If this is modified, we can use updateBufferIndices() to pass those changes
     * on to the gpu, without having to create a new buffer model! */
	data: Float32Array,
	/**
	 * **Call this** when you update specific vertex data within the source Float32Array!
	 * FAST. Prevents you having to create a whole new model!
	 * For example, when a single piece in the mesh moves.
     * @param {number} changedIndicesStart - The index in the vertex data marking the first value changed.
     * @param {number} changedIndicesCount - The number of indices in the vertex data that were changed, beginning at {@link changedIndicesStart}.
	 */
	// eslint-disable-next-line no-unused-vars
	updateBufferIndices: (changedIndicesStart: number, changedIndicesCount: number) => void,
	/** 
     * **Renders** the buffer model! Translates and scales according to the provided arguments.
     * Applies any custom uniform values before rendering.
     * @param [position] - The positional translation, default [0,0,0]
     * @param [scale] - The scaling transformation, default [1,1,1]
     * @param uniforms - Custom uniform values, for example, 'tintColor'. 
     */
	render: (
		// eslint-disable-next-line no-unused-vars
		position?: [number, number, number],
		// eslint-disable-next-line no-unused-vars
		scale?: [number, number, number],
		// eslint-disable-next-line no-unused-vars
		uniforms?: { [uniform: string]: any }
	) => void
}


// Variables ----------------------------------------------------------------------------------


/**
 * This script contains all the functions used to generate renderable buffer models of the
 * game objects that the shader programs can use. It receives the object's vertex data to do so.
 */

/** Valid primitives to render. */
const validRenderModes = ["TRIANGLES", "TRIANGLE_STRIP", "TRIANGLE_FAN", "POINTS", "LINE_LOOP", "LINE_STRIP", "LINES"];


// Functions ----------------------------------------------------------------------------------


/**
 * The universal function for creating a renderable model,
 * given the vertex data, attribute information,
 * primitive rendering mode, and texture.
 */
function createModel(
	/** The array of vertex data of the mesh to be rendered. */
	data: number[] | Float32Array,
	/** The number of position components for a single vertex: x,y,z */
	numPositionComponents: 2 | 3,
	/** What drawing primitive to use. */
	mode: 'TRIANGLES' | 'TRIANGLE_STRIP' | 'TRIANGLE_FAN' | 'POINTS' | 'LINE_LOOP' | 'LINE_STRIP' | 'LINES',
	/** Whether the vertex data contains color attributes. */
	usingColor: boolean,
	/** If applicable, a texture to be bound when rendering (vertex data should contain texcoord attributes). */
	texture?: WebGLTexture
): BufferModel {
	const usingTexture = texture !== undefined;
	const attribInfo = getAttribInfo(numPositionComponents, usingColor, usingTexture);
	return createModel_GivenAttribInfo(data, attribInfo, mode, texture);
}

/**
 * Returns the attribute information object for some vertex data,
 * given the number of position components, and whether we're using
 * color and/or texture components.
 */
function getAttribInfo(numPositionComponents: 2 | 3, usingColor: boolean, usingTexture: boolean): AttributeInfo {
	if (usingColor && usingTexture) {
		return [{ name: 'position', numComponents: numPositionComponents }, { name: 'texcoord', numComponents: 2 }, { name: 'color', numComponents: 4 }];
	} else if (usingColor) {
		return [{ name: 'position', numComponents: numPositionComponents }, { name: 'color', numComponents: 4 }];
	} else if (usingTexture) {
		return [{ name: 'position', numComponents: numPositionComponents }, { name: 'texcoord', numComponents: 2 }];
	} else throw new Error('Well we must be using ONE of either color or texcoord in our vertex data..');
}

/**
 * Creates a renderable model, given the AttributeInfo object.
 */
function createModel_GivenAttribInfo(
	data: number[] | Float32Array,
	attribInfo: AttributeInfo,
	mode: 'TRIANGLES' | 'TRIANGLE_STRIP' | 'TRIANGLE_FAN' | 'POINTS' | 'LINE_LOOP' | 'LINE_STRIP' | 'LINES',
	texture?: WebGLTexture
): BufferModel {
	if (!validRenderModes.includes(mode)) throw new Error(`Mode "${mode}" is not an accepted value!`);
	const stride = getStrideFromAttributeInfo(attribInfo);
	if (data.length % stride !== 0) throw new Error("Data length is not divisible by stride when creating a buffer model. Check to make sure the specified attribInfo is correct.");

	data = ensureFloat32Array(data); // Ensure the data is a Float32Array
	const BYTES_PER_ELEMENT = Float32Array.BYTES_PER_ELEMENT;

	const vertexCount = data.length / stride;

	const buffer = createBufferFromData(data);

	return {
		data,
		updateBufferIndices: (
			changedIndicesStart: number,
			changedIndicesCount: number
		) => updateBufferIndices(buffer, data, changedIndicesStart, changedIndicesCount),
		render: (
			position: [number, number, number] = [0, 0, 0],
			scale: [number, number, number] = [1, 1, 1],
			uniforms: { [uniform: string]: any } = {}
		) => render(buffer, attribInfo, position, scale, stride, BYTES_PER_ELEMENT, uniforms, vertexCount, mode, texture),		
	};
}

/**
 * Accumulates the stride from the provided attribute info object.
 * Each attribute tells us how many components it uses.
 */
function getStrideFromAttributeInfo(attribInfo: AttributeInfo) {
	return attribInfo.reduce((totalElements, currentAttrib) => { return totalElements + currentAttrib.numComponents; }, 0);
}

/**
 * Ensures the input is a Float32Array. If the input is already a Float32Array,
 * it is returned as-is. If it's a number array, a new Float32Array is created.
 * @param data - The input data, which can be either a number array or a Float32Array.
 * @returns A Float32Array representation of the input data.
 */
function ensureFloat32Array(data: number[] | Float32Array): Float32Array {
	if (data instanceof Float32Array) return data;
	if (data.length > 1_000_000) console.warn("Performance Warning: Float32Array generated from a very large number array (over 1 million in length). It is suggested to start with a Float32Array when computing your data!");
	return new Float32Array(data);
}

/**
 * Renders a model. This handles everything from switching shader programs,
 * to preparing the attributes, preparing the uniforms, transforming the object
 * according to the provided position and scale, to the draw call.
 * @param buffer - The buffer that we have passed the vertex data into.
 * @param attribInfo - The AttributeInfo object, storing what attributes are in a single stride of the vertex data, and how many components they use.
 * @param position - The positional translation of the object: `[x,y,z]`
 * @param scale - The scale transformation of the object: `[x,y,z]`
 * @param stride - The vertex data's stride per vertex.
 * @param BYTES_PER_ELEMENT - How many bytes each element in the vertex data array take up (usually Float32Array.BYTES_PER_ELEMENT).
 * @param uniforms - An object with custom uniform names for the keys, and their value for the values. A custom uniform example is 'tintColor'. Uniforms that are NOT custom are [transformMatrix, uSampler]
 * @param vertexCount - The mesh's vertex count.
 * @param mode - Primitive rendering mode (e.g. "TRIANGLES" / "LINES"). See {@link validRenderModes}.
 * @param texture - The texture to bind, if applicable (we should be using the texcoord attribute).
 */
function render(
	buffer: WebGLBuffer,
	attribInfo: AttributeInfo,
	position: [number,number,number],
	scale: [number,number,number],
	stride: number,
	BYTES_PER_ELEMENT: number,
	uniforms: { [uniform: string]: any },
	vertexCount: number,
	mode: 'TRIANGLES' | 'TRIANGLE_STRIP' | 'TRIANGLE_FAN' | 'POINTS' | 'LINE_LOOP' | 'LINE_STRIP' | 'LINES',
	texture?: WebGLTexture
) {
	// Use the optimal shader to get the job done! Whichever shader uses the attributes and uniforms we need!
	const attributesUsed = Object.values(attribInfo).map((attrib) => attrib.name);
	const uniformsUsed = Object.keys(uniforms);
	const shader = shaders.shaderPicker(attributesUsed, uniformsUsed);

	// Switch to the program
	gl.useProgram(shader.program);

	// Prepare the attributes...
	enableAttributes(shader, buffer, attribInfo, stride, BYTES_PER_ELEMENT);

	// Prepare the uniforms...
	setUniforms(shader, position, scale, uniforms, texture);

	// Call the draw function!
	const offset = 0; // How many points of the model to skip.
	gl.drawArrays(gl[mode], offset, vertexCount);

	// Unbind the texture
	// HAS TO BE AFTER THE DRAW CALL, or the render won't work.
	// We can't put it at the end of setUniforms()
	gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Enables the attributes for use before a draw call.
 * Tells the gpu how it will extract the data from the vertex data buffer.
 * @param shader - The currently bound shader program, and the one we'll be rendering with.
 * @param buffer - The buffer that we have passed the vertex data into.
 * @param attribInfo - The AttributeInfo object, storing what attributes are in a single stride of the vertex data, and how many components they use.
 * @param stride - The vertex data's stride per vertex.
 * @param BYTES_PER_ELEMENT - How many bytes each element in the vertex data array take up (usually Float32Array.BYTES_PER_ELEMENT).
 */
function enableAttributes(shader: ShaderProgram, buffer: WebGLBuffer, attribInfo: AttributeInfo, stride: number, BYTES_PER_ELEMENT: number) {
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

	const stride_bytes = stride * BYTES_PER_ELEMENT; // # bytes in each vertex/line.
	let currentOffsetBytes = 0; // how many bytes inside the buffer to start from.

	for (const attrib of attribInfo) {
		// Tell WebGL how to pull out the values from the vertex data and into the attribute in the shader code...
		gl.vertexAttribPointer(shader.attribLocations[attrib.name], attrib.numComponents, gl.FLOAT, false, stride_bytes, currentOffsetBytes);
		gl.enableVertexAttribArray(shader.attribLocations[attrib.name]); // Enable the attribute for use
		// Reset divisor to 0 for non-instanced rendering.
		// If another shader set the same attribute index to be
		// used for instanced rendering, it would otherwise never be reset!
		gl.vertexAttribDivisor(shader.attribLocations[attrib.name], 0); // 0 = attrib updated once per vertex   1 = updated once per instance

		// Adjust our offset for the next attribute
		currentOffsetBytes += attrib.numComponents * BYTES_PER_ELEMENT;
	}

	gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind the buffer
}

/**
 * Sets the uniforms, preparing them before a draw call.
 * The worldMatrix uniform is updated with EVERY draw call!
 * @param shader - The currently bound shader program, and the one we'll be rendering with.
 * @param position - The positional translation of the object: `[x,y,z]`
 * @param scale - The scale transformation of the object: `[x,y,z]`
 * @param uniforms - An object with custom uniform names for the keys, and their value for the values. A custom uniform example is 'tintColor'. Uniforms that are NOT custom are [transformMatrix, uSampler]
 * @param texture - The texture to bind, if applicable (we should be using the texcoord attribute).
 */
function setUniforms(shader: ShaderProgram, position: [number,number,number], scale: [number,number,number], uniforms?: { [uniform: string]: any }, texture?: WebGLTexture): void {

	{
		// Update the transformMatrix on the gpu, EVERY render call!!
		// This contains our camera, perspective projection, and the
		// positional and scale transformations of the mesh we're rendering!
		// If we do not update this every frame, the uniform value from
		// the previous draw call will bleed through.
	
		const { projMatrix, viewMatrix } = camera.getProjAndViewMatrixes();
	
		// Order of matrix multiplication goes:
		// uProjMatrix * uViewMatrix * uWorldMatrix ==> transformMatrix
		// Then in the shader we will do:
		// transformMatrix * positionVec4
	
		// The positional and scale transformation matrix of the mesh we're rendering
		const worldMatrix = genWorldMatrix(position, scale);
	
		// Multiply the matrices in order
		const transformMatrix = mat4.create();
		mat4.multiply(transformMatrix, projMatrix, viewMatrix);  // First multiply projMatrix and viewMatrix
		mat4.multiply(transformMatrix, transformMatrix, worldMatrix); // Then multiply the result by worldMatrix
		
		// Send the transformMatrix to the gpu
		gl.uniformMatrix4fv(shader.uniformLocations.transformMatrix, false, transformMatrix);
	}

	if (texture) {
		// The active texture unit is 0 by default, but needs to be set before you bind each texture IF YOU ARE PLANNING ON USING MULTIPLE TEXTURES,
		// and then you must tell the GPU what texture unit each uSampler is bound to.
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		// Tell the gpu we bound the texture to texture unit 0
		gl.uniform1i(shader.uniformLocations.uSampler, 0);
	}

	if (!uniforms) return; // No custom uniforms
	for (const [name, value] of Object.entries(uniforms)) { // Send each custom uniform to the gpu
		if (name === 'tintColor') return gl.uniform4fv(shader.uniformLocations[name], value);
		throw new Error(`Uniform "${name}" is not a supported uniform we can set!`);
	}
}

/**
 * Generates a world matrix given a position and scale to transform it by!
 * The gpu works with matrices REALLY FAST, so this is the most optimal way
 * to translate our models into position.
 */
function genWorldMatrix(position: [number,number,number], scale: [number,number,number]) {
	const worldMatrix = mat4.create();
	mat4.scale(worldMatrix, worldMatrix, scale);
	mat4.translate(worldMatrix, worldMatrix, position);
	return worldMatrix;
}



export {
	createModel,
	BufferModel, // The type definition
};