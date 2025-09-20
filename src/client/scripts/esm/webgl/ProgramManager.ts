
// src/client/scripts/esm/webgl/ProgramManager.ts

import { ShaderProgram } from './ShaderProgram';

// Generic Shaders
import vsSource_color from '../../../shaders/color/vertex.glsl';
import fsSource_color from '../../../shaders/color/fragment.glsl';
import vsSource_colorInstanced from '../../../shaders/color/instanced/vertex.glsl';
import fsSource_colorInstanced from '../../../shaders/color/instanced/fragment.glsl';
import vsSource_texture from '../../../shaders/texture/vertex.glsl';
import fsSource_texture from '../../../shaders/texture/fragment.glsl';
import vsSource_textureInstanced from '../../../shaders/texture/instanced/vertex.glsl';
import fsSource_textureInstanced from '../../../shaders/texture/instanced/fragment.glsl';
import vsSource_colorTexture from '../../../shaders/color_texture/vertex.glsl';
import fsSource_colorTexture from '../../../shaders/color_texture/fragment.glsl';
// Specialized Shaders
import vsSource_miniImages from '../../../shaders/mini_images/vertex.glsl';
import fsSource_miniImages from '../../../shaders/mini_images/fragment.glsl';
import vsSource_highlights from '../../../shaders/highlights/vertex.glsl';
import fsSource_highlights from '../../../shaders/highlights/fragment.glsl';
import vsSource_arrows from '../../../shaders/arrows/vertex.glsl';
import fsSource_arrows from '../../../shaders/arrows/fragment.glsl';
import vsSource_arrowImages from '../../../shaders/arrow_images/vertex.glsl';
import fsSource_arrowImages from '../../../shaders/arrow_images/fragment.glsl';
import vsSource_starfield from '../../../shaders/starfield/vertex.glsl';
import fsSource_starfield from '../../../shaders/starfield/fragment.glsl';


// =============================== Type Definitions ===============================


// Attribute and Uniform Union Types for each ShaderProgram

// Generic Shaders
type Attributes_Color = 'a_position' | 'a_color';
type Uniforms_Color = 'u_transformmatrix';
type Attributes_ColorInstanced = 'a_position' | 'a_color' | 'a_instanceposition';
type Uniforms_ColorInstanced = 'u_transformmatrix';
type Attributes_Texture = 'a_position' | 'a_texturecoord';
type Uniforms_Texture = 'u_transformmatrix' | 'u_sampler';
type Attributes_TextureInstanced = 'a_position' | 'a_texturecoord' | 'a_color';
type Uniforms_TextureInstanced = 'u_transformmatrix' | 'u_sampler';
type Attributes_ColorTexture = 'a_position' | 'a_texturecoord' | 'a_color';
type Uniforms_ColorTexture = 'u_transformmatrix' | 'u_sampler';
// Specialized Shaders
type Attributes_MiniImages = 'a_position' | 'a_texturecoord' | 'a_color' | 'a_instanceposition';
type Uniforms_MiniImages = 'u_transformmatrix' | 'u_sampler' | 'u_size';
type Attributes_Highlights = 'a_position' | 'a_color' | 'a_instanceposition';
type Uniforms_Highlights = 'u_transformmatrix' | 'u_size';
type Attributes_Arrows = 'a_position' | 'a_instanceposition' | 'a_instancecolor' | 'a_instancerotation';
type Uniforms_Arrows = 'u_transformmatrix';
type Attributes_ArrowImages = 'a_position' | 'a_texturecoord' | 'a_instanceposition' | 'a_instancetexcoord' | 'a_instancecolor';
type Uniforms_ArrowImages = 'u_transformmatrix' | 'u_sampler';
type Attributes_Starfield = 'a_position' | 'a_instanceposition' | 'a_instancecolor' | 'a_instancesize';
type Uniforms_Starfield = 'u_transformmatrix';


// Each ShaderProgram type

// Generic Shaders
type Program_Color = ShaderProgram<Attributes_Color, Uniforms_Color>;
type Program_ColorInstanced = ShaderProgram<Attributes_ColorInstanced, Uniforms_ColorInstanced>;
type Program_Texture = ShaderProgram<Attributes_Texture, Uniforms_Texture>;
type Program_TextureInstanced = ShaderProgram<Attributes_TextureInstanced, Uniforms_TextureInstanced>;
type Program_ColorTexture = ShaderProgram<Attributes_ColorTexture, Uniforms_ColorTexture>;
// Specialized Shaders
type Program_MiniImages = ShaderProgram<Attributes_MiniImages, Uniforms_MiniImages>;
type Program_Highlights = ShaderProgram<Attributes_Highlights, Uniforms_Highlights>;
type Program_Arrows = ShaderProgram<Attributes_Arrows, Uniforms_Arrows>;
type Program_ArrowImages = ShaderProgram<Attributes_ArrowImages, Uniforms_ArrowImages>;
type Program_Starfield = ShaderProgram<Attributes_Starfield, Uniforms_Starfield>;


export interface ProgramMap {
	// Generic Shaders
	color: Program_Color;
	colorInstanced: Program_ColorInstanced;
	texture: Program_Texture;
	textureInstanced: Program_TextureInstanced;
	colorTexture: Program_ColorTexture;
	// Specialized Shaders
	miniImages: Program_MiniImages;
	highlights: Program_Highlights;
	arrows: Program_Arrows;
	arrowImages: Program_ArrowImages;
	starfield: Program_Starfield;
}

/** The vertex and fragment shader source codes for a shader. */
type ShaderSource = {
	/** The vertex shader source code. */
	vertex: string;
	/** The fragment shader source code. */
	fragment: string
};


// =============================== Implementation ===============================


/** A mapping from program names to their corresponding shader sources. */
const shaderSources: Record<keyof ProgramMap, ShaderSource> = {
	// Generic Shaders
	color: { vertex: vsSource_color, fragment: fsSource_color },
	colorInstanced: { vertex: vsSource_colorInstanced, fragment: fsSource_colorInstanced },
	texture: { vertex: vsSource_texture, fragment: fsSource_texture },
	textureInstanced: { vertex: vsSource_textureInstanced, fragment: fsSource_textureInstanced },
	colorTexture: { vertex: vsSource_colorTexture, fragment: fsSource_colorTexture },
	// Specialized Shaders
	miniImages: { vertex: vsSource_miniImages, fragment: fsSource_miniImages },
	highlights: { vertex: vsSource_highlights, fragment: fsSource_highlights },
	arrows: { vertex: vsSource_arrows, fragment: fsSource_arrows },
	arrowImages: { vertex: vsSource_arrowImages, fragment: fsSource_arrowImages },
	starfield: { vertex: vsSource_starfield, fragment: fsSource_starfield }
};



/**
 * A factory and cache for creating and managing ShaderProgram instances.
 * Ensures that each shader program is only compiled and linked once.
 */
export class ProgramManager {
	private readonly gl: WebGLRenderingContext;
	// The cache stores programs by their key from ProgramMap. We use a base
	// ShaderProgram type here internally, but the public `get` method provides full type safety.
	private programCache: Map<keyof ProgramMap, ShaderProgram<any, any>> = new Map();


	constructor(gl: WebGLRenderingContext) {
		this.gl = gl;
	}


	/**
	 * Retrieves a compiled and linked ShaderProgram from the cache, or creates it if it doesn't exist.
	 *
	 * @template K - The key (name) of the program to retrieve.
	 * @param programName - The name of the shader program (e.g., 'phong', 'unlit').
	 * @returns The fully-typed ShaderProgram instance.
	 */
	public get<K extends keyof ProgramMap>(programName: K): ProgramMap[K] {
	// 1. Check if the program is already in the cache.
		if (this.programCache.has(programName)) {
			// We use a type assertion `as ProgramMap[K]` because we trust that the
			// internal cache is consistent with our public interface.
			return this.programCache.get(programName)! as ProgramMap[K];
		}

		// 2. If not, get the source code for the requested program.
		const sources = shaderSources[programName];
		if (!sources) throw Error(`Shader sources for program "${programName}" not found.`);

		// 3. Create a new ShaderProgram instance.
		//    The generic arguments for the new instance are inferred here,
		//    but the return type of the `get` method is what provides the
		//    type safety to the consumer.
		console.log(`Compiling and linking shader program: ${programName}`);
		const program = new ShaderProgram(this.gl, sources.vertex, sources.fragment);

		// 4. Store it in the cache for future requests.
		this.programCache.set(programName, program);

		return program as ProgramMap[K];
	}
}