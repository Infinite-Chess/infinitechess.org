// src/client/scripts/webgl/Renderable.ts

/**
 * Builds renderable models from vertex data, a shader, textures and attribute layouts, plain or
 * instanced, through {@link createRenderableFactory}: one set of create-functions per WebGL context.
 * Plain models render the frame they're built from the context's shared buffers; persistent
 * models own their buffers across frames until disposed.
 */

import type { Vec3 } from '../../../shared/util/math/vectors.js';
import type { TypedArray } from './BufferUtil.js';
import type { ShaderProgram } from './ShaderProgram.js';
import type { AttributeName, ProgramManager, ProgramMap } from './ProgramManager.js';

import * as mat4 from 'gl-matrix/mat4';

import BufferUtil from './BufferUtil.js';

// Types -----------------------------------------------------------------------

/** A 4x4 matrix, represented as a 16-element Float32Array */
export type Mat4 = Float32Array;

/**
 * The minimum a camera must provide for a factory to render with it. Kept narrow so
 * this layer stays free of the board's camera, which satisfies it structurally.
 */
interface ViewSource {
	getProjAndViewMatrixes(): { projMatrix: Mat4; viewMatrix: Mat4 };
}

/**
 * Any kind of array that may be passed to the create-functions
 * to be used as vertex or instance data for a buffer model.
 *
 * Number arrays are converted into a Float32Array,
 * which have a max safe integer of 16,777,215 (16 million),
 * and a max value of 3.4e38. so beware of precision loss!
 *
 * number[] => Double precision (64-bit). Max safe integer of 9,007,199,254,740,991 (9 quadrillion). Max value of 1.8e+308.
 */
export type InputArray = number[] | TypedArray;

/** All valid primitive shapes we can render with */
export type PrimitiveType =
	| 'TRIANGLES'
	| 'TRIANGLE_STRIP'
	| 'TRIANGLE_FAN'
	| 'POINTS'
	| 'LINE_LOOP'
	| 'LINE_STRIP'
	| 'LINES';

/** An object describing a single attribute inside our vertex data, and how many components it has per stride/vertex. */
interface Attribute {
	/** The name of the attribute. */
	name: AttributeName;
	/** How many values the attribute has in a single stride/vertex of our data array. */
	numComponents: number;
}

/** An object containing all attributes that some vertex data contains. */
export type AttributeInfo = Attribute[];

/** An object containing the attribute info of both our vertex data and instance data. */
export type AttributeInfoInstanced = {
	vertexDataAttribInfo: AttributeInfo;
	instanceDataAttribInfo: AttributeInfo;
};

/**
 * A value a custom uniform may be set to. Numbers become floats,
 * booleans become ints, and arrays of 2-4 become the matching vec.
 */
export type UniformValue = number | boolean | [number, number] | [number, number, number] | [number, number, number, number]; // prettier-ignore

/** A texture, along with its given uniform name in the desired shader. */
export interface TextureInfo {
	texture: WebGLTexture;
	/** e.g., 'u_sampler', 'u_noiseTexture' */
	uniformName: string;
}

/**
 * **Call this** when you update specific vertex data within the source Float32Array!
 * FAST. Prevents you having to create a whole new model!
 * For example, when a single piece in the mesh moves.
 * @param changedIndicesStart - The index in the vertex data marking the first value changed.
 * @param changedIndicesCount - The number of indices in the vertex data that were changed, beginning at {@link changedIndicesStart}.
 */
type UpdateBufferIndicesFunc = (changedIndicesStart: number, changedIndicesCount: number) => void;

/** A renderable model, to render the frame it's built. */
export interface Renderable {
	/**
	 * **Renders** the buffer model! Translates and scales according to the provided arguments.
	 * Applies any custom uniform values before rendering.
	 * @param [position] - The positional translation, default [0,0,0]
	 * @param [scale] - The scaling transformation, default [1,1,1]
	 * @param uniforms - Custom uniform values, for example, 'u_size'.
	 */
	render: (position?: Vec3, scale?: Vec3, uniforms?: Record<string, UniformValue>) => void;
}

/** A renderable model kept across frames, owning its GPU buffer. */
export interface PersistentRenderable extends Renderable {
	/** A reference to the vertex data, stored in a Float32Array, that went into this model's buffer.
	 * If this is modified, we can use updateBufferIndices() to pass those changes
	 * on to the gpu, without having to create a new buffer model! */
	data: TypedArray;
	updateBufferIndices: UpdateBufferIndicesFunc;
	/** Frees the model's GPU buffer and VAO. Never render it afterward. */
	dispose: () => void;
}

/** A {@link PersistentRenderable} that uses instanced rendering. */
export interface PersistentRenderableInstanced extends Renderable {
	/** A reference to the vertex data of a SINGLE INSTANCE, stored in a Float32Array, that went into this model's buffer.
	 * If this is modified, we can use updateBufferIndices() to pass those changes
	 * on to the gpu, without having to create a new buffer model! */
	vertexData: TypedArray;
	/** A reference to the vertex data OF EACH INSTANCE, stored in a Float32Array, that went into this model's buffer.
	 * If this is modified, we can use updateBufferIndices() to pass those changes
	 * on to the gpu, without having to create a new buffer model! */
	instanceData: TypedArray;
	updateBufferIndices_VertexBuffer: UpdateBufferIndicesFunc;
	updateBufferIndices_InstanceBuffer: UpdateBufferIndicesFunc;
	/** Frees the model's GPU buffers and VAO. Never render it afterward. */
	dispose: () => void;
}

/** A set of create-functions bound to one WebGL context, as returned by {@link createRenderableFactory}. */
export interface RenderableFactory {
	/**
	 * The universal function for creating a renderable model,
	 * given the vertex data, attribute information,
	 * primitive rendering mode, and texture.
	 * @param numPositionComponents - The number of position components for a single vertex: x,y,z
	 * @param texture - If applicable, a texture to be bound when rendering (vertex data should contain texcoord attributes).
	 */
	createRenderable(
		data: InputArray,
		numPositionComponents: 2 | 3,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): Renderable;
	/**
	 * The universal function for creating a renderable model THAT USES INSTANCED RENDERING,
	 * given the vertex data and instance data, both attribute informations, primitive rendering mode, and texture!
	 * @param vertexData - The vertex data of a single instance of the mesh.
	 * @param usingColor - Whether the vertex data of a single instance contains color attributes, NOT the instance-specific data.
	 * @param texture - If applicable, a texture to be bound when rendering (vertex data should contain texcoord attributes).
	 */
	createRenderable_Instanced(
		vertexData: InputArray,
		instanceData: InputArray,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): Renderable;
	/** Creates a renderable model, given the AttributeInfo object. */
	createRenderable_GivenInfo(
		data: InputArray,
		attribInfo: AttributeInfo,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures?: TextureInfo[],
	): Renderable;
	/**
	 * Creates a renderable model that uses instanced rendering,
	 * given the AttributeInfo objects of both the vertex data and instance data arrays.
	 */
	createRenderable_Instanced_GivenInfo(
		vertexData: InputArray,
		instanceData: InputArray,
		attribInfoInstanced: AttributeInfoInstanced,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures?: TextureInfo[],
	): Renderable;
	/** {@link createRenderable}, as a model kept across frames. */
	createPersistentRenderable(
		...args: Parameters<RenderableFactory['createRenderable']>
	): PersistentRenderable;
	/** {@link createRenderable_Instanced}, as a model kept across frames. */
	createPersistentRenderable_Instanced(
		...args: Parameters<RenderableFactory['createRenderable_Instanced']>
	): PersistentRenderableInstanced;
	/** {@link createRenderable_Instanced_GivenInfo}, as a model kept across frames. */
	createPersistentRenderable_Instanced_GivenInfo(
		...args: Parameters<RenderableFactory['createRenderable_Instanced_GivenInfo']>
	): PersistentRenderableInstanced;
}

/** One buffer's data and how its attributes are laid out. */
interface BufferLayout {
	attribInfo: AttributeInfo;
	/** Whether its attributes advance once per instance, instead of once per vertex. */
	instanced: boolean;
}

/** A model's data, ready to upload: each buffer's contents and layout, and how to draw it. */
interface Geometry<A extends TypedArray[] = TypedArray[]> {
	shader: keyof ProgramMap;
	textures: TextureInfo[];
	/** The contents of each buffer, matching {@link layouts}. */
	arrays: A;
	layouts: BufferLayout[];
	/** Issues the draw call, once the model's VAO is bound. */
	draw: () => void;
}

/** A VAO and its buffers, reused by every plain renderable of one shader and layout. */
interface StreamSlot {
	shaderProgram: ShaderProgram<string, string>;
	vao: WebGLVertexArrayObject;
	buffers: WebGLBuffer[];
}

// Context-bound factory -------------------------------------------------------

/**
 * Builds the renderable create-functions bound to a specific WebGL context, ProgramManager,
 * and camera. Models created here draw into that context, transformed by that camera.
 */
function createRenderableFactory(
	gl: WebGL2RenderingContext,
	programManager: ProgramManager,
	cam: ViewSource,
): RenderableFactory {
	/** Scratch matrix reused by every draw call. */
	const transformMatrix: Mat4 = mat4.create();

	/** Plain renderables' reused VAOs and buffers, keyed by shader and layout. */
	const streamSlots = new Map<string, StreamSlot>();

	// --- Plain models ---

	function createRenderable(
		data: InputArray,
		numPositionComponents: 2 | 3,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): Renderable {
		const attribInfo = getAttribInfo(numPositionComponents, usingColor, texture !== undefined);
		return createRenderable_GivenInfo(data, attribInfo, mode, shader, getTextureInfo(texture));
	}

	function createRenderable_Instanced(
		vertexData: InputArray,
		instanceData: InputArray,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): Renderable {
		const attribInfoInstanced = getAttribInfo_Instanced(usingColor, texture !== undefined);
		return createRenderable_Instanced_GivenInfo(vertexData, instanceData, attribInfoInstanced, mode, shader, getTextureInfo(texture)); // prettier-ignore
	}

	function createRenderable_GivenInfo(
		data: InputArray,
		attribInfo: AttributeInfo,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures: TextureInfo[] = [],
	): Renderable {
		return createStreamed(prepareGeometry(data, attribInfo, mode, shader, textures));
	}

	function createRenderable_Instanced_GivenInfo(
		vertexData: InputArray,
		instanceData: InputArray,
		attribInfoInstanced: AttributeInfoInstanced,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures: TextureInfo[] = [],
	): Renderable {
		return createStreamed(prepareGeometry_Instanced(vertexData, instanceData, attribInfoInstanced, mode, shader, textures)); // prettier-ignore
	}

	/** A model of the geometry that uploads into its shader and layout's shared buffers each render. */
	function createStreamed(geometry: Geometry): Renderable {
		return {
			render: (position, scale, uniforms): void => {
				const slot = getStreamSlot(geometry.shader, geometry.layouts);
				geometry.arrays.forEach((array, i) =>
					BufferUtil.refill(gl, slot.buffers[i]!, array),
				);
				prepareAndExecuteRender(slot.shaderProgram, slot.vao, geometry, position, scale, uniforms); // prettier-ignore
			},
		};
	}

	/** Returns the reused VAO and buffers for the shader and layouts, creating them on first use. */
	function getStreamSlot(shader: keyof ProgramMap, layouts: BufferLayout[]): StreamSlot {
		const key = shader + layouts.map((l) => (l.instanced ? 'i' : 'v') + l.attribInfo.map((a) => a.name + a.numComponents).join()).join('|'); // prettier-ignore
		let slot = streamSlots.get(key);
		if (slot === undefined) {
			const shaderProgram = programManager.get(shader);
			const buffers = layouts.map(() => gl.createBuffer());
			slot = { shaderProgram, vao: createVAO(shaderProgram, buffers, layouts), buffers };
			streamSlots.set(key, slot);
		}
		return slot;
	}

	// --- Persistent models ---

	function createPersistentRenderable(
		data: InputArray,
		numPositionComponents: 2 | 3,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): PersistentRenderable {
		const attribInfo = getAttribInfo(numPositionComponents, usingColor, texture !== undefined);
		const geometry = prepareGeometry(data, attribInfo, mode, shader, getTextureInfo(texture));
		const [typedData] = geometry.arrays;
		const { buffers, render, dispose } = createOwned(geometry);
		return {
			data: typedData,
			updateBufferIndices: (changedIndicesStart: number, changedIndicesCount: number): void =>
				BufferUtil.updateIndices(gl, buffers[0]!, typedData, changedIndicesStart, changedIndicesCount), // prettier-ignore
			render,
			dispose,
		};
	}

	function createPersistentRenderable_Instanced(
		vertexData: InputArray,
		instanceData: InputArray,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		usingColor: boolean,
		texture?: WebGLTexture,
	): PersistentRenderableInstanced {
		const attribInfoInstanced = getAttribInfo_Instanced(usingColor, texture !== undefined);
		return createPersistentRenderable_Instanced_GivenInfo(vertexData, instanceData, attribInfoInstanced, mode, shader, getTextureInfo(texture)); // prettier-ignore
	}

	function createPersistentRenderable_Instanced_GivenInfo(
		vertexData: InputArray,
		instanceData: InputArray,
		attribInfoInstanced: AttributeInfoInstanced,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures: TextureInfo[] = [],
	): PersistentRenderableInstanced {
		const geometry = prepareGeometry_Instanced(vertexData, instanceData, attribInfoInstanced, mode, shader, textures); // prettier-ignore
		const [typedVertexData, typedInstanceData] = geometry.arrays;
		const { buffers, render, dispose } = createOwned(geometry);
		return {
			vertexData: typedVertexData,
			instanceData: typedInstanceData,
			updateBufferIndices_VertexBuffer: (changedIndicesStart: number, changedIndicesCount: number): void =>
				BufferUtil.updateIndices(gl, buffers[0]!, typedVertexData, changedIndicesStart, changedIndicesCount), // prettier-ignore
			updateBufferIndices_InstanceBuffer: (changedIndicesStart: number, changedIndicesCount: number): void =>
				BufferUtil.updateIndices(gl, buffers[1]!, typedInstanceData, changedIndicesStart, changedIndicesCount), // prettier-ignore
			render,
			dispose,
		};
	}

	/** Uploads a geometry into buffers and a VAO of its own, which it renders from until disposed. */
	function createOwned(
		geometry: Geometry,
	): Renderable & { buffers: WebGLBuffer[]; dispose: () => void } {
		const shaderProgram = programManager.get(geometry.shader);
		const buffers = geometry.arrays.map((array) => BufferUtil.createFromData(gl, array));
		const vao = createVAO(shaderProgram, buffers, geometry.layouts);
		return {
			buffers,
			render: (position, scale, uniforms): void =>
				prepareAndExecuteRender(shaderProgram, vao, geometry, position, scale, uniforms),
			dispose: (): void => {
				buffers.forEach((buffer) => gl.deleteBuffer(buffer));
				gl.deleteVertexArray(vao);
			},
		};
	}

	// --- Shared ---

	/** Prepares a model's data for upload, checking it against its layout. */
	function prepareGeometry(
		data: InputArray,
		attribInfo: AttributeInfo,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures: TextureInfo[],
	): Geometry<[TypedArray]> {
		const typedData = toTypedArray(data, attribInfo);
		const vertexCount = typedData.length / getStrideFromAttributeInfo(attribInfo);
		return {
			shader,
			textures,
			arrays: [typedData],
			layouts: [{ attribInfo, instanced: false }],
			draw: (): void => gl.drawArrays(gl[mode], 0, vertexCount),
		};
	}

	/** Prepares an instanced model's data for upload, checking both arrays against their layouts. */
	function prepareGeometry_Instanced(
		vertexData: InputArray,
		instanceData: InputArray,
		{ vertexDataAttribInfo, instanceDataAttribInfo }: AttributeInfoInstanced,
		mode: PrimitiveType,
		shader: keyof ProgramMap,
		textures: TextureInfo[],
	): Geometry<[TypedArray, TypedArray]> {
		const typedVertexData = toTypedArray(vertexData, vertexDataAttribInfo);
		const typedInstanceData = toTypedArray(instanceData, instanceDataAttribInfo);
		const vertexCount =
			typedVertexData.length / getStrideFromAttributeInfo(vertexDataAttribInfo); // Of one single instance
		const instanceCount = typedInstanceData.length / getStrideFromAttributeInfo(instanceDataAttribInfo); // prettier-ignore
		return {
			shader,
			textures,
			arrays: [typedVertexData, typedInstanceData],
			layouts: [
				{ attribInfo: vertexDataAttribInfo, instanced: false },
				{ attribInfo: instanceDataAttribInfo, instanced: true },
			],
			draw: (): void => gl.drawArraysInstanced(gl[mode], 0, vertexCount, instanceCount),
		};
	}

	/** Creates a VAO recording how the shader reads each buffer, per its layout. */
	function createVAO<A extends string, U extends string>(
		shaderProgram: ShaderProgram<A, U>,
		buffers: WebGLBuffer[],
		layouts: BufferLayout[],
	): WebGLVertexArrayObject {
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		layouts.forEach((layout, i) => configureAttributes(shaderProgram, buffers[i]!, layout));
		gl.bindVertexArray(null); // The configuration is now saved inside the 'vao' object.
		gl.bindBuffer(gl.ARRAY_BUFFER, null); // configureAttributes() binds it
		return vao;
	}

	/**
	 * Configures the attributes for a shader program.
	 * Tells the gpu how it will extract the data from the vertex data buffer.
	 * BINDS THE BUFFER FOR YOU.
	 * @param shaderProgram - The shader program we'll be rendering with.
	 * @param buffer - The buffer that we have passed the vertex data into.
	 * @param layout - What attributes are in a single stride of the buffer, and whether they're per instance.
	 */
	function configureAttributes<A extends string, U extends string>(
		shaderProgram: ShaderProgram<A, U>,
		buffer: WebGLBuffer,
		{ attribInfo, instanced }: BufferLayout,
	): void {
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

		const BYTES_PER_ELEMENT = Float32Array.BYTES_PER_ELEMENT; // Every attribute is read as gl.FLOAT
		const stride_bytes = getStrideFromAttributeInfo(attribInfo) * BYTES_PER_ELEMENT; // # bytes in each vertex/line.
		const vertexAttribDivisor = instanced ? 1 : 0; // 0 = attribs updated once per vertex   1 = updated once per instance
		let currentOffsetBytes = 0; // how many bytes inside the buffer to start from.

		for (const attrib of attribInfo) {
			const attribLoc = shaderProgram.getAttributeLocation(attrib.name as A);
			// Tell WebGL how to pull out the values from the vertex data and into the attribute in the shader code...
			gl.vertexAttribPointer(
				attribLoc,
				attrib.numComponents,
				gl.FLOAT,
				false,
				stride_bytes,
				currentOffsetBytes,
			);
			gl.enableVertexAttribArray(attribLoc); // Enable the attribute for use
			// Be sure to set this every time, even if it's to 0!
			// If another shader set the same attribute index to be
			// used for instanced rendering, it would otherwise never be reset!
			gl.vertexAttribDivisor(attribLoc, vertexAttribDivisor); // 0 = attrib updated once per vertex   1 = updated once per instance

			// Adjust our offset for the next attribute
			currentOffsetBytes += attrib.numComponents * BYTES_PER_ELEMENT;
		}
	}

	/**
	 * Renders a model, preparing the GPU state beforehand and cleaning up afterwards.
	 * @param shaderProgram - The shader program to render with.
	 * @param vao - The Vertex Array Object that stores the attribute configuration.
	 * @param geometry - The model's textures and draw call.
	 * @param position - The positional translation of the object: `[x,y,z]`
	 * @param scale - The scale transformation of the object: `[x,y,z]`
	 * @param uniforms - An object with custom uniform names for the keys, and their value for the values. A custom uniform example is 'u_size'. Uniforms that are NOT custom are transformmatrix, and all texture samplers.
	 */
	function prepareAndExecuteRender<A extends string, U extends string>(
		shaderProgram: ShaderProgram<A, U>,
		vao: WebGLVertexArrayObject,
		{ textures, draw }: Geometry,
		position: Vec3 = [0, 0, 0],
		scale: Vec3 = [1, 1, 1],
		uniforms: Record<string, UniformValue> = {},
	): void {
		// Switch to the program
		shaderProgram.use();
		// Bind the VAO. ONE call to restore all attribute configuration.
		gl.bindVertexArray(vao);
		// Prepare the uniforms.
		setUniforms(shaderProgram, position, scale, uniforms, textures);

		// Call the draw function!
		draw();

		// Unbind the VAO.
		gl.bindVertexArray(null);
		// Unbind textures from all units that were used.
		// HAS TO BE AFTER THE DRAW CALL, or the render won't work.
		// We can't put it at the end of setUniforms()
		textures.forEach((_texInfo, i) => {
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture(gl.TEXTURE_2D, null);
		});
	}

	/**
	 * Sets the uniforms, preparing them before a draw call.
	 * The transformmatrix uniform is updated with EVERY draw call!
	 * @param shaderProgram - The currently bound shader program, and the one we'll be rendering with.
	 * @param position - The positional translation of the object: `[x,y,z]`
	 * @param scale - The scale transformation of the object: `[x,y,z]`
	 * @param uniforms - An object with custom uniform names for the keys, and their value for the values. A custom uniform example is 'u_size'. Uniforms that are NOT custom are [transformMatrix, uSampler]
	 * @param textures - The textures to bind, if any (we should be using the texcoord attribute).
	 */
	function setUniforms<A extends string, U extends string>(
		shaderProgram: ShaderProgram<A, U>,
		position: Vec3,
		scale: Vec3,
		uniforms: Record<string, UniformValue>,
		textures: TextureInfo[],
	): void {
		// Calculate the final Model-View-Projection matrix for this object
		const transformMatrix = genTransformMatrix(position, scale);
		// Send the transformMatrix to the gpu (every shader has this uniform)
		gl.uniformMatrix4fv(
			shaderProgram.getUniformLocation('u_transformmatrix' as U),
			false,
			transformMatrix,
		);

		// Bind and set all textures
		textures.forEach((texInfo, i) => {
			const uLoc = shaderProgram.getUniformLocation(texInfo.uniformName as U);
			// Skip if the shader doesn't use this uniform. Useful for using the same model with different shaders?
			if (uLoc === null) {
				console.warn(`Uniform "${texInfo.uniformName}" not found in shader when trying to set texture. Skipping...`); // prettier-ignore
				return;
			}

			// Activate a unique texture unit for each texture.
			gl.activeTexture(gl.TEXTURE0 + i);
			// Bind the texture to that unit.
			gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);
			// Tell the sampler uniform to use the texture unit we just activated.
			gl.uniform1i(uLoc, i);
		});

		// Handle custom uniforms provided in the render call.
		for (const [name, value] of Object.entries(uniforms)) {
			const uLoc = shaderProgram.getUniformLocation(name as U);

			// It's common for game logic to pass uniforms that a specific shader might not use, so we just skip them.
			if (uLoc === null) {
				console.warn(`Uniform "${name}" not found in shader when trying to set custom uniform. Skipping...`); // prettier-ignore
				continue;
			}

			setUniformValue(uLoc, name, value);
		}
	}

	/** Sets one custom uniform, inferring the gl.uniform* call from the value's type and structure. */
	function setUniformValue(uLoc: WebGLUniformLocation, name: string, value: UniformValue): void {
		if (Array.isArray(value)) {
			// Value is an array, treat it as a vector (e.g., vec2, vec3, vec4)
			switch (value.length) {
				case 2:
					gl.uniform2fv(uLoc, value);
					break;
				case 3:
					gl.uniform3fv(uLoc, value);
					break;
				case 4:
					gl.uniform4fv(uLoc, value);
					break;
				default:
					console.warn(`Unsupported array length for uniform "${name}". Expected 2, 3, or 4.`); // prettier-ignore
			}
		} else if (typeof value === 'number') {
			// Value is a number, treat it as a float
			gl.uniform1f(uLoc, value);
		} else if (typeof value === 'boolean') {
			// Value is a boolean, treat it as an integer (0 or 1)
			gl.uniform1i(uLoc, value ? 1 : 0);
		} else {
			throw new Error(`Unsupported data type "${typeof value}" for uniform "${name}".`);
		}
	}

	/**
	 * Calculates the final Model-View-Projection matrix for a given object:
	 * projection * view * scale * translation. Overwrites {@link transformMatrix}.
	 */
	function genTransformMatrix(position: Vec3, scale: Vec3): Mat4 {
		const { projMatrix, viewMatrix } = cam.getProjAndViewMatrixes();
		mat4.multiply(transformMatrix, projMatrix, viewMatrix);
		mat4.scale(transformMatrix, transformMatrix, scale);
		mat4.translate(transformMatrix, transformMatrix, position);
		return transformMatrix;
	}

	return {
		createRenderable,
		createRenderable_GivenInfo,
		createRenderable_Instanced,
		createRenderable_Instanced_GivenInfo,
		createPersistentRenderable,
		createPersistentRenderable_Instanced,
		createPersistentRenderable_Instanced_GivenInfo,
	};
}

// Pure helpers (context-independent) ------------------------------------------

/**
 * Returns the attribute information object for some vertex data,
 * given the number of position components, and whether we're using
 * color and/or texture components.
 */
function getAttribInfo(
	numPositionComponents: 2 | 3,
	usingColor: boolean,
	usingTexture: boolean,
): AttributeInfo {
	if (usingColor && usingTexture) {
		return [
			{ name: 'a_position', numComponents: numPositionComponents },
			{ name: 'a_texturecoord', numComponents: 2 },
			{ name: 'a_color', numComponents: 4 },
		];
	} else if (usingColor) {
		return [
			{ name: 'a_position', numComponents: numPositionComponents },
			{ name: 'a_color', numComponents: 4 },
		];
	} else if (usingTexture) {
		return [
			{ name: 'a_position', numComponents: numPositionComponents },
			{ name: 'a_texturecoord', numComponents: 2 },
		];
	} else {
		throw new Error('Well we must be using ONE of either color or texcoord in our vertex data..'); // prettier-ignore
	}
}

/**
 * Returns the attribute information for the vertex and instance data arrays,
 * provided whether the vertex data contains color and/or texture coordinate information.
 */
function getAttribInfo_Instanced(
	usingColor: boolean,
	usingTexture: boolean,
): AttributeInfoInstanced {
	const vertexDataAttribInfo: AttributeInfo = [{ name: 'a_position', numComponents: 2 }];
	if (usingTexture) vertexDataAttribInfo.push({ name: 'a_texturecoord', numComponents: 2 });
	if (usingColor) vertexDataAttribInfo.push({ name: 'a_color', numComponents: 4 });
	return {
		vertexDataAttribInfo,
		instanceDataAttribInfo: [{ name: 'a_instanceposition', numComponents: 2 }],
	};
}

/** Returns the texture info of a model with at most one texture, bound to 'u_sampler'. */
function getTextureInfo(texture: WebGLTexture | undefined): TextureInfo[] {
	return texture === undefined ? [] : [{ texture, uniformName: 'u_sampler' }];
}

/**
 * Accumulates the stride from the provided attribute info object.
 * Each attribute tells us how many components it uses.
 */
function getStrideFromAttributeInfo(attribInfo: AttributeInfo): number {
	return attribInfo.reduce((totalElements, currentAttrib) => {
		return totalElements + currentAttrib.numComponents;
	}, 0);
}

/** Converts data to a typed array, after checking it holds a whole number of strides of its layout. */
function toTypedArray(data: InputArray, attribInfo: AttributeInfo): TypedArray {
	const stride = getStrideFromAttributeInfo(attribInfo);
	if (data.length % stride !== 0)
		throw new Error(`Data length (${data.length}) is not divisible by its stride (${stride}). Check to make sure the specified attribInfo is correct.`); // prettier-ignore
	return ensureTypedArray(data);
}

/**
 * Ensures the input is a typed array. If it already is, it is returned as-is.
 * If it's a number array, a new Float32Array is created.
 */
function ensureTypedArray(data: InputArray): TypedArray {
	if (!Array.isArray(data)) return data; // If it's already a TypedArray, return it.

	if (data.length > 1_000_000) {
		console.warn('Performance Warning: Float32Array generated from a very large number array (over 1 million in length). It is suggested to start with a Float32Array when computing your data!'); // prettier-ignore
	}
	return new Float32Array(data);
}

export { createRenderableFactory };
