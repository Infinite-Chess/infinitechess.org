
/**
 * This script contains all the functions used to generate renderable buffer models of the
 * game objects that the shader programs can use. It receives the object's vertex data to do so,
 * and the attribute information, if applicable, such as how many components of the vertex data
 * are dedicated to position, color, texture coordinates, etc.
 * 
 * It is also capable of instanced rendering.
 */


import type { Vec3 } from '../../util/math.js';
import type { ShaderProgram } from './shaders.js';

import { createBufferFromData, updateBufferIndices } from './buffers.js';
import shaders from './shaders.js';
// @ts-ignore
import { gl } from './webgl.js';
// @ts-ignore
import mat4 from './gl-matrix.js';
// @ts-ignore
import camera from './camera.js';


// Type Definitions -----------------------------------------------------------------------


/** Any kind of array, whether number[], or typed array, that may be passed to use as vertex data for a model. */
type InputArray =
	number[] // Converted to Float32Array, coming from float64s, with max safe integer: 9,007,199,254,740,991    Max value: 1.8e+308
	| TypedArray

/** All signed type arrays compatible with WebGL, that can be used as vertex data. */
type TypedArray =
	Float32Array // Max safe integer: 16,777,215    Max value: 3.4e+38
	| Int8Array // Max integer: 127
	| Int16Array // Max integer: 32,767
	| Int32Array; // Max integer: 2,147,483,647

/** All valid primitive shapes we can render with */
type PrimitiveType = 'TRIANGLES' | 'TRIANGLE_STRIP' | 'TRIANGLE_FAN' | 'POINTS' | 'LINE_LOOP' | 'LINE_STRIP' | 'LINES';

/** An object describing a single attribute inside our vertex data, and how many components it has per stride/vertex. */
interface Attribute {
	/** The name of the attribute. */
	name: 'position' | 'texcoord' | 'color' | 'instanceposition' | 'instancecolor' | 'instancerotation' | 'instancetexcoord';
	/** How many values the attribute has in a single stride/vertex of our data array. */
	numComponents: number
};

/** An object containing all attributes that some vertex data contains. */
type AttributeInfo = Attribute[];

/** An object containing the attribute info of both our vertex data and instance data. */
type AttributeInfoInstanced = { vertexDataAttribInfo: AttributeInfo, instanceDataAttribInfo: AttributeInfo };

/**
 * **Call this** when you update specific vertex data within the source Float32Array!
 * FAST. Prevents you having to create a whole new model!
 * For example, when a single piece in the mesh moves.
 * @param {number} changedIndicesStart - The index in the vertex data marking the first value changed.
 * @param {number} changedIndicesCount - The number of indices in the vertex data that were changed, beginning at {@link changedIndicesStart}.
 */
// eslint-disable-next-line no-unused-vars
type UpdateBufferIndicesFunc = (changedIndicesStart: number, changedIndicesCount: number) => void;

/** Contains the properties that both the {@link BufferModel} and {@link BufferModelInstanced} types share. */
interface BaseBufferModel {
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

/** A renderable model. */
interface BufferModel extends BaseBufferModel {
	/** A reference to the vertex data, stored in a Float32Array, that went into this model's buffer.
     * If this is modified, we can use updateBufferIndices() to pass those changes
     * on to the gpu, without having to create a new buffer model! */
	data: TypedArray,
	updateBufferIndices: UpdateBufferIndicesFunc,
}

/** A renderable model that uses instanced rendering! */
interface BufferModelInstanced extends BaseBufferModel {
	/** A reference to the vertex data of a SINGLE INSTANCE, stored in a Float32Array, that went into this model's buffer.
     * If this is modified, we can use updateBufferIndices() to pass those changes
     * on to the gpu, without having to create a new buffer model! */
	vertexData: TypedArray,
	/** A reference to the vertex data OF EACH INSTANCE, stored in a Float32Array, that went into this model's buffer.
     * If this is modified, we can use updateBufferIndices() to pass those changes
     * on to the gpu, without having to create a new buffer model! */
	instanceData: TypedArray,
	updateBufferIndices_VertexBuffer: UpdateBufferIndicesFunc,
	updateBufferIndices_InstanceBuffer: UpdateBufferIndicesFunc,
}


// Variables ----------------------------------------------------------------------------------



// Functions ----------------------------------------------------------------------------------


/**
 * The universal function for creating a renderable model,
 * given the vertex data, attribute information,
 * primitive rendering mode, and texture.
 */
function createModel(
	/** The array of vertex data of the mesh to be rendered. */
	data: InputArray,
	/** The number of position components for a single vertex: x,y,z */
	numPositionComponents: 2 | 3,
	/** What drawing primitive to use. */
	mode: PrimitiveType,
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
 * The universal function for creating a renderable model THAT USES INSTANCED RENDERING,
 * given the vertex data and instance data, both attribute informations, primitive rendering mode, and texture!
 */
function createModel_Instanced( 
	/** The array of vertex data of a single instance of the mesh. */
	vertexData: InputArray,
	/** The instance-specific vertex data of the mesh. */
	instanceData: InputArray,
	/** What drawing primitive to use. */
	mode: PrimitiveType,
	/** Whether the vertex data of a single instance contains color attributes, NOT THE INSTANCE-SPECIFIC DATA. */
	usingColor: boolean,
	/** If applicable, a texture to be bound when rendering (instance data should contain texcoord attributes). */
	texture?: WebGLTexture
): BufferModelInstanced {
	const usingTexture = texture !== undefined;
	const attribInfoInstanced = getAttribInfo_Instanced(usingColor, usingTexture);
	return createModel_Instanced_GivenAttribInfo(vertexData, instanceData, attribInfoInstanced, mode, texture);
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
 * Returns the attribute information for the vertex and instance data arrays,
 * provided whether the vertex data contains color information,
 * and whether the instance data contains texture coordinates.
 */
function getAttribInfo_Instanced(usingColor: boolean, usingTexture: boolean): AttributeInfoInstanced {
	if (usingColor && usingTexture) {
		return {
			vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'color', numComponents: 4 }],
			instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }, { name: 'instancetexcoord', numComponents: 2 }]
		};
	} else if (usingColor) {
		return {
			vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }, { name: 'color', numComponents: 4 }],
			instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }]
		};
	} else if (usingTexture) {
		return {
			vertexDataAttribInfo: [{ name: 'position', numComponents: 2 }],
			instanceDataAttribInfo: [{ name: 'instanceposition', numComponents: 2 }, { name: 'instancetexcoord', numComponents: 2 }]
		};
	} else throw new Error('Well we must be using ONE of either color or texcoord in our vertex data..');
}

/**
 * Creates a renderable model, given the AttributeInfo object.
 */
function createModel_GivenAttribInfo(
	data: InputArray,
	attribInfo: AttributeInfo,
	mode: PrimitiveType,
	texture?: WebGLTexture
): BufferModel {
	const stride = getStrideFromAttributeInfo(attribInfo);
	if (data.length % stride !== 0) throw new Error("Data length is not divisible by stride when creating a buffer model. Check to make sure the specified attribInfo is correct.");

	data = ensureTypedArray(data); // Ensure the data is a Float32Array
	const BYTES_PER_ELEMENT = data.BYTES_PER_ELEMENT;

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
 * Creates a renderable model that uses instanced rendering,
 * given the AttributeInfo objects of both the vertex data and instance data arrays.
 */
function createModel_Instanced_GivenAttribInfo(
	vertexData: InputArray,
	instanceData: InputArray,
	attribInfoInstanced: AttributeInfoInstanced,
	mode: PrimitiveType,
	texture?: WebGLTexture
): BufferModelInstanced {
	const vertexDataStride = getStrideFromAttributeInfo(attribInfoInstanced.vertexDataAttribInfo);
	const instanceDataStride = getStrideFromAttributeInfo(attribInfoInstanced.instanceDataAttribInfo);
	if (vertexData.length % vertexDataStride !== 0) throw new Error("Vertex data length is not divisible by stride when creating an instanced buffer model. Check to make sure the specified attribInfo is correct.");
	if (instanceData.length % instanceDataStride !== 0) throw new Error("Instance data length is not divisible by stride when creating an instanced buffer model. Check to make sure the specified attribInfo is correct.");

	vertexData = ensureTypedArray(vertexData);
	instanceData = ensureTypedArray(instanceData);
	const BYTES_PER_ELEMENT_VData = vertexData.BYTES_PER_ELEMENT;
	const BYTES_PER_ELEMENT_IData = instanceData.BYTES_PER_ELEMENT;
	

	const instanceVertexCount = vertexData.length / vertexDataStride;
	const instanceCount = instanceData.length / instanceDataStride;

	const vertexBuffer = createBufferFromData(vertexData);
	const instanceBuffer = createBufferFromData(instanceData);

	return {
		vertexData,
		instanceData,
		updateBufferIndices_VertexBuffer: (
			changedIndicesStart: number,
			changedIndicesCount: number
		) => updateBufferIndices(vertexBuffer, vertexData, changedIndicesStart, changedIndicesCount),
		updateBufferIndices_InstanceBuffer: (
			changedIndicesStart: number,
			changedIndicesCount: number
		) => updateBufferIndices(instanceBuffer, instanceData, changedIndicesStart, changedIndicesCount),
		render: (
			position: [number, number, number] = [0, 0, 0],
			scale: [number, number, number] = [1, 1, 1],
			uniforms: { [uniform: string]: any } = {}
		) => render_Instanced(vertexBuffer, instanceBuffer, attribInfoInstanced, position, scale, vertexDataStride, instanceDataStride, BYTES_PER_ELEMENT_VData, BYTES_PER_ELEMENT_IData, uniforms, instanceVertexCount, instanceCount, mode, texture),		
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
 * Ensures the input is a Float32Array. If the input is already a typed array,
 * it is returned as-is. If it's a number array, a new Float32Array is created.
 * @param data - The input data, which can be either a number array or a typed array.
 * @returns A Float32Array representation of the input data.
 */
function ensureTypedArray(data: InputArray): TypedArray {
	if (!Array.isArray(data)) return data; // If it's already a TypedArray, return it.

	if (data.length > 1_000_000) {
		console.warn("Performance Warning: Float32Array generated from a very large number array (over 1 million in length). It is suggested to start with a Float32Array when computing your data!");
	}
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
	position: Vec3,
	scale: Vec3,
	stride: number,
	BYTES_PER_ELEMENT: number,
	uniforms: { [uniform: string]: any },
	vertexCount: number,
	mode: PrimitiveType,
	texture?: WebGLTexture
) {
	// Use the optimal shader to get the job done! Whichever shader uses the attributes and uniforms we need!
	const attributesUsed = Object.values(attribInfo).map((attrib) => attrib.name);
	const uniformsUsed = Object.keys(uniforms);
	const shader = shaders.shaderPicker(attributesUsed, uniformsUsed);

	// Switch to the program
	gl.useProgram(shader.program);

	// Prepare the attributes...
	enableAttributes(shader, buffer, attribInfo, stride, BYTES_PER_ELEMENT, false);

	// Prepare the uniforms...
	setUniforms(shader, position, scale, uniforms, texture);

	// Call the draw function!
	gl.drawArrays(gl[mode], 0, vertexCount);

	// Unbind the texture
	// HAS TO BE AFTER THE DRAW CALL, or the render won't work.
	// We can't put it at the end of setUniforms()
	if (texture) gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Renders a model that uses instanced rendering. This handles everything from switching shader programs,
 * to preparing the attributes, preparing the uniforms, transforming the object
 * according to the provided position and scale, to the draw call!
 * @param vertexBuffer - The buffer that we have passed the vertex data into of a single instance.
 * @param instanceBuffer - The buffer that we have passed the instance-specific data into.
 * @param vertexDataAttribInfo - The AttributeInfo object, storing what attributes are in a single stride of the vertex data of a single instance, and how many components they use.
 * @param instanceDataAttribInfo - The AttributeInfo object, storing what attributes are in a single stride of the instance-specific data, and how many components they use.
 * @param position - The positional translation of the object: `[x,y,z]`
 * @param scale - The scale transformation of the object: `[x,y,z]`
 * @param vertexDataStride - The vertex data's stride per vertex of a single instance.
 * @param instanceDataStride - The instance-specific data's stride per instance.
 * @param BYTES_PER_ELEMENT - How many bytes each element in the vertex data array take up (usually Float32Array.BYTES_PER_ELEMENT).
 * @param uniforms - An object with custom uniform names for the keys, and their value for the values. A custom uniform example is 'tintColor'. Uniforms that are NOT custom are [transformMatrix, uSampler]
 * @param instanceVertexCount - The vertex count of a single instance, or the number of vertices in the vertex data.
 * @param instanceCount - The number of total instances, or the length of the instance-specific data divided by that data's stride.
 * @param mode - Primitive rendering mode (e.g. "TRIANGLES" / "LINES"). See {@link validRenderModes}.
 * @param texture - The texture to bind, if applicable (we should be using the texcoord attribute).
 */
function render_Instanced( // vertexBuffer, instanceBuffer, vertexDataAttribInfo, instanceDataAttribInfo, position, scale, vertexDataStride, instanceDataStride, BYTES_PER_ELEMENT, uniforms, instanceVertexCount, instanceCount, mode, texture
	vertexBuffer: WebGLBuffer,
	instanceBuffer: WebGLBuffer,
	attribInfoInstanced: AttributeInfoInstanced,
	position: Vec3,
	scale: Vec3,
	vertexDataStride: number,
	instanceDataStride: number,
	BYTES_PER_ELEMENT_VData: number,
	BYTES_PER_ELEMENT_IData: number,
	uniforms: { [uniform: string]: any },
	instanceVertexCount: number,
	instanceCount: number,
	mode: PrimitiveType,
	texture?: WebGLTexture
) {
	// Use the optimal shader to get the job done! Whichever shader uses the attributes and uniforms we need!
	const attributesUsed_VertexData = Object.values(attribInfoInstanced.vertexDataAttribInfo).map((attrib) => attrib.name);
	const attributesUsed_InstanceData = Object.values(attribInfoInstanced.instanceDataAttribInfo).map((attrib) => attrib.name);
	const attributesUsed = [...attributesUsed_VertexData, ...attributesUsed_InstanceData];
	const uniformsUsed = Object.keys(uniforms);
	const shader = shaders.shaderPicker(attributesUsed, uniformsUsed);

	// Switch to the program
	gl.useProgram(shader.program);

	// Prepare the attributes...
	enableAttributes(shader, vertexBuffer, attribInfoInstanced.vertexDataAttribInfo, vertexDataStride, BYTES_PER_ELEMENT_VData, false); // The attributes of a single instance are NOT instance-specific
	enableAttributes(shader, instanceBuffer, attribInfoInstanced.instanceDataAttribInfo, instanceDataStride, BYTES_PER_ELEMENT_IData, true); // Instance-specific

	// Prepare the uniforms...
	setUniforms(shader, position, scale, uniforms, texture);

	// Call the draw function! Render using drawArraysInstanced
	gl.drawArraysInstanced(gl[mode], 0, instanceVertexCount, instanceCount);

	// Unbind the texture
	// HAS TO BE AFTER THE DRAW CALL, or the render won't work.
	// We can't put it at the end of setUniforms()
	if (texture) gl.bindTexture(gl.TEXTURE_2D, null);
}



/**
 * Enables the attributes for use before a draw call.
 * Tells the gpu how it will extract the data from the vertex data buffer.
 * @param shader - The currently bound shader program, and the one we'll be rendering with.
 * @param buffer - The buffer that we have passed the vertex data into.
 * @param attribInfo - The AttributeInfo object, storing what attributes are in a single stride of the vertex data, and how many components they use.
 * @param stride - The vertex data's stride per vertex.
 * @param BYTES_PER_ELEMENT - How many bytes each element in the vertex data array take up (usually Float32Array.BYTES_PER_ELEMENT).
 * @param instanced - Whether the provided attributes to enable are instance-specific attributes (only updated once per instance instead of once per vertex)
 */
function enableAttributes(shader: ShaderProgram, buffer: WebGLBuffer, attribInfo: AttributeInfo, stride: number, BYTES_PER_ELEMENT: number, instanced: boolean) {
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

	// IF WE BIND A VERTEX ARRAY OBJECT here, then unbind it after our initAttribute() calls,
	// then for future render calls we don't need to make the same initAttribute() calls,
	// but instead we just bind the vertex array object!
	// ...

	const stride_bytes = stride * BYTES_PER_ELEMENT; // # bytes in each vertex/line.
	const vertexAttribDivisor = instanced ? 1 : 0; // 0 = attribs updated once per vertex   1 = updated once per instance
	let currentOffsetBytes = 0; // how many bytes inside the buffer to start from.

	for (const attrib of attribInfo) {
		// Tell WebGL how to pull out the values from the vertex data and into the attribute in the shader code...
		gl.vertexAttribPointer(shader.attribLocations[attrib.name], attrib.numComponents, gl.FLOAT, false, stride_bytes, currentOffsetBytes);
		gl.enableVertexAttribArray(shader.attribLocations[attrib.name]); // Enable the attribute for use
		// Be sure to set this every time, even if it's to 0!
		// If another shader set the same attribute index to be
		// used for instanced rendering, it would otherwise never be reset!
		gl.vertexAttribDivisor(shader.attribLocations[attrib.name], vertexAttribDivisor); // 0 = attrib updated once per vertex   1 = updated once per instance

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
function setUniforms(shader: ShaderProgram, position: Vec3, scale: Vec3, uniforms: { [uniform: string]: any }, texture?: WebGLTexture): void {

	{
		// Update the transformMatrix on the gpu, EVERY render call!!
		// This contains our camera, perspective projection, and the
		// positional and scale transformations of the mesh we're rendering!
		// If we do not update this draw call, the uniform value from
		// the previous draw call will bleed through.
	
		const { projMatrix, viewMatrix } = camera.getProjAndViewMatrixes();
	
		// Order of matrix multiplication goes:
		// uProjMatrix * uViewMatrix * uWorldMatrix ==> transformMatrix
		// Then in the shader we will do:
		// transformMatrix * positionVec4
	
		// The positional and scale transformation matrix of the single object we're rendering
		const worldMatrix = genWorldMatrix(position, scale);
	
		// Multiply the matrices in order
		const transformMatrix = mat4.create();
		mat4.multiply(transformMatrix, projMatrix, viewMatrix);  // First multiply projMatrix and viewMatrix
		mat4.multiply(transformMatrix, transformMatrix, worldMatrix); // Then multiply the result by worldMatrix
		
		// Send the transformMatrix to the gpu (every shader has this uniform)
		gl.uniformMatrix4fv(shader.uniformLocations['transformMatrix'], false, transformMatrix);
	}

	if (texture) {
		// The active texture unit is 0 by default, but needs to be set before you bind each texture IF YOU ARE PLANNING ON USING MULTIPLE TEXTURES,
		// and then you must tell the GPU what texture unit each uSampler is bound to.
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		// Tell the gpu we bound the texture to texture unit 0
		gl.uniform1i(shader.uniformLocations['uSampler'], 0);
	}

	// Custom uniforms provided in the render call, for example 'tintColor'...
	if (Object.keys(uniforms).length === 0) return; // No custom uniforms
	for (const [name, value] of Object.entries(uniforms)) { // Send each custom uniform to the gpu
		if (name === 'tintColor') gl.uniform4fv(shader.uniformLocations[name], value);
		else throw Error(`Uniform "${name}" is not a supported uniform we can set!`);
	}
}

/**
 * Generates a world matrix given a position and scale to transform it by!
 * The gpu works with matrices REALLY FAST, so this is the most optimal way
 * to translate our models into position.
 */
function genWorldMatrix(position: Vec3, scale: Vec3) {
	const worldMatrix = mat4.create();
	mat4.scale(worldMatrix, worldMatrix, scale);
	mat4.translate(worldMatrix, worldMatrix, position);
	return worldMatrix;
}



export {
	createModel,
	createModel_Instanced,
	createModel_Instanced_GivenAttribInfo,
	BufferModel, // The type definition
	BufferModelInstanced, // The type definition
};

export type {
	AttributeInfoInstanced,
	TypedArray,
};