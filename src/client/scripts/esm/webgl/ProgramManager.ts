
// src/client/scripts/esm/webgl/ProgramManager.ts

import { ShaderProgram } from './ShaderProgram';

// Generic Shaders
import vsSource_color from '../../../shaders/color/vertex.glsl';
import fsSource_color from '../../../shaders/color/fragment.glsl';
import vsSource_colorInstanced from '../../../shaders/color/instanced/vertex.glsl';
import vsSource_texture from '../../../shaders/texture/vertex.glsl';
import fsSource_texture from '../../../shaders/texture/fragment.glsl';
import vsSource_textureInstanced from '../../../shaders/texture/instanced/vertex.glsl';
import vsSource_colorTexture from '../../../shaders/color_texture/vertex.glsl';
import fsSource_colorTexture from '../../../shaders/color_texture/fragment.glsl';
// Specialized Shaders
import vsSource_miniImages from '../../../shaders/mini_images/vertex.glsl';
import fsSource_miniImages from '../../../shaders/mini_images/fragment.glsl';
import vsSource_highlights from '../../../shaders/highlights/vertex.glsl';
import vsSource_arrows from '../../../shaders/arrows/vertex.glsl';
import vsSource_arrowImages from '../../../shaders/arrow_images/vertex.glsl';
import fsSource_arrowImages from '../../../shaders/arrow_images/fragment.glsl';
import vsSource_starfield from '../../../shaders/starfield/vertex.glsl';
// Post Processing Shaders
import vsSource_postPass from '../../../shaders/post_pass/vertex.glsl';
import fsSource_postPass from '../../../shaders/post_pass/fragment.glsl';
import fsSource_colorGrade from '../../../shaders/color_grade/fragment.glsl';
import fsSource_vignette from '../../../shaders/vignette/fragment.glsl';
import fsSource_sineWave from '../../../shaders/sine_wave/fragment.glsl';
import fsSource_waterRipple from '../../../shaders/water_ripple/fragment.glsl';
import fsSource_heatWave from '../../../shaders/heat_wave/fragment.glsl';


// =============================== Type Definitions ===============================


// Attribute and Uniform Union Types for each ShaderProgram

// Generic Shaders
type Attributes_Color = 'a_position' | 'a_color';
type Uniforms_Color = 'u_transformmatrix';
type Attributes_ColorInstanced = 'a_position' | 'a_color' | 'a_instanceposition';
type Uniforms_ColorInstanced = 'u_transformmatrix';
type Attributes_Texture = 'a_position' | 'a_texturecoord';
type Uniforms_Texture = 'u_transformmatrix' | 'u_sampler';
type Attributes_TextureInstanced = 'a_position' | 'a_texturecoord' | 'a_instanceposition';
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
// Post Processing Shaders
type Attributes_PostPass = never;
type Uniforms_PostPass = 'u_sceneTexture';
type Attributes_ColorGrade = never;
type Uniforms_ColorGrade = 'u_sceneTexture' | 'u_brightness' | 'u_contrast' | 'u_gamma' | 'u_saturation' | 'u_tintColor' | 'u_hueOffset';
type Attributes_Vignette = never;
type Uniforms_Vignette = 'u_sceneTexture' | 'u_radius' | 'u_softness' | 'u_intensity';
type Attributes_SineWave = never;
type Uniforms_SineWave = 'u_sceneTexture' | 'u_amplitude' | 'u_frequency' | 'u_time' | 'u_angle';
type Attributes_WaterRipple = never;
type Uniforms_WaterRipple = 'u_sceneTexture' | 'u_centers' | 'u_times' | 'u_dropletCount' | 'u_strength' | 'u_propagationSpeed' | 'u_oscillationSpeed' | 'u_frequency' | 'u_glintIntensity' | 'u_glintExponent' | 'u_falloff' | 'u_resolution';
type Attributes_HeatWave = never;
type Uniforms_HeatWave = 'u_sceneTexture' | 'u_noiseTexture' | 'u_time' | 'u_strength';


/** The Super Union of all possible attributes. */
export type Attributes_All = Attributes_Color | Attributes_ColorInstanced | Attributes_Texture | Attributes_TextureInstanced | Attributes_ColorTexture | Attributes_MiniImages | Attributes_Highlights | Attributes_Arrows | Attributes_ArrowImages | Attributes_Starfield | Attributes_PostPass | Attributes_ColorGrade | Attributes_Vignette | Attributes_SineWave | Attributes_WaterRipple | Attributes_HeatWave;


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
// Post Processing Shaders
type Program_PostPass = ShaderProgram<Attributes_PostPass, Uniforms_PostPass>;
type Program_ColorGrade = ShaderProgram<Attributes_ColorGrade, Uniforms_ColorGrade>;
type Program_Vignette = ShaderProgram<Attributes_Vignette, Uniforms_Vignette>;
type Program_SineWave = ShaderProgram<Attributes_SineWave, Uniforms_SineWave>;
type Program_WaterRipple = ShaderProgram<Attributes_WaterRipple, Uniforms_WaterRipple>;
type Program_HeatWave = ShaderProgram<Attributes_HeatWave, Uniforms_HeatWave>;


export interface ProgramMap {
	// ======= Generic Shaders =======

	/** Renders meshes with colored vertices. */
	color: Program_Color;
	/** Instance renders a mesh with colored vertices. */
	colorInstanced: Program_ColorInstanced;
	/** Renders a textured mesh. */
	texture: Program_Texture;
	/** Instance renders a textured mesh. */
	textureInstanced: Program_TextureInstanced;
	/** Renders a textured mesh with colored vertices. */
	colorTexture: Program_ColorTexture;

	// ======= Specialized Shaders =======

	/** Renders mini images. */
	miniImages: Program_MiniImages;
	/** Renders mini images. Instance renders square highlights of a given size. */
	highlights: Program_Highlights;
	/** Renders arrows (not the images, but tha arrow tip). */
	arrows: Program_Arrows;
	/** Renders arrow images. */
	arrowImages: Program_ArrowImages;
	/** Renders the starfield squares. */
	starfield: Program_Starfield;

	// ======= Post Processing Shaders =======

	/** Post Processing Pass-Through Shader. Zero effects. */
	post_pass: Program_PostPass;
	/** Post Processing Color Grading Shader. Several color effects. */
	color_grade: Program_ColorGrade;
	/** Post Processing Vignette Effect. */
    vignette: Program_Vignette;
	/** Post Processing Dual Axis Sine Wave Distortion Effect. */
	sine_wave: Program_SineWave;
	/** Post Processing Water Ripple Distortion Effect. */
    water_ripple: Program_WaterRipple;
	/** Post Processing Heat Wave Distortion Effect. */
    heat_wave: Program_HeatWave;
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
	colorInstanced: { vertex: vsSource_colorInstanced, fragment: fsSource_color },
	texture: { vertex: vsSource_texture, fragment: fsSource_texture },
	textureInstanced: { vertex: vsSource_textureInstanced, fragment: fsSource_texture },
	colorTexture: { vertex: vsSource_colorTexture, fragment: fsSource_colorTexture },
	// Specialized Shaders
	miniImages: { vertex: vsSource_miniImages, fragment: fsSource_miniImages },
	highlights: { vertex: vsSource_highlights, fragment: fsSource_color },
	arrows: { vertex: vsSource_arrows, fragment: fsSource_color },
	arrowImages: { vertex: vsSource_arrowImages, fragment: fsSource_arrowImages },
	starfield: { vertex: vsSource_starfield, fragment: fsSource_color },
	// Post Processing Shaders
	post_pass: { vertex: vsSource_postPass, fragment: fsSource_postPass },
	color_grade: { vertex: vsSource_postPass, fragment: fsSource_colorGrade },
	vignette: { vertex: vsSource_postPass, fragment: fsSource_vignette },
	sine_wave: { vertex: vsSource_postPass, fragment: fsSource_sineWave },
	water_ripple: { vertex: vsSource_postPass, fragment: fsSource_waterRipple },
	heat_wave: { vertex: vsSource_postPass, fragment: fsSource_heatWave },
};


/**
 * A factory and cache for creating and managing ShaderProgram instances.
 * Ensures that each shader program is only compiled and linked once.
 */
export class ProgramManager {
	private readonly gl: WebGL2RenderingContext;
	// The cache stores programs by their key from ProgramMap. We use a base
	// ShaderProgram type here internally, but the public `get` method provides full type safety.
	private programCache: Map<keyof ProgramMap, ShaderProgram<any, any>> = new Map();


	constructor(gl: WebGL2RenderingContext) {
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
		// console.log(`Compiling and linking shader program: ${programName}`);
		const program = new ShaderProgram(this.gl, sources.vertex, sources.fragment);

		// 4. Store it in the cache for future requests.
		this.programCache.set(programName, program);

		return program as ProgramMap[K];
	}
}