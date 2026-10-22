// src/client/scripts/esm/webgl/ProgramManager.ts

/**
 * The catalogue of every shader the game has, and a per-context cache that compiles
 * each one only on first use.
 */

import vsSource_color from '../../../shaders/color/vertex.glsl';
import fsSource_color from '../../../shaders/color/fragment.glsl';
import fsSource_water from '../../../shaders/water/fragment.glsl';
import vsSource_arrows from '../../../shaders/arrows/vertex.glsl';
import fsSource_glitch from '../../../shaders/glitch/fragment.glsl';
import vsSource_texture from '../../../shaders/texture/vertex.glsl';
import fsSource_texture from '../../../shaders/texture/fragment.glsl';
import vsSource_postPass from '../../../shaders/post_pass/vertex.glsl';
import fsSource_postPass from '../../../shaders/post_pass/fragment.glsl';
import fsSource_vignette from '../../../shaders/vignette/fragment.glsl';
import fsSource_sineWave from '../../../shaders/sine_wave/fragment.glsl';
import fsSource_heatWave from '../../../shaders/heat_wave/fragment.glsl';
import { ShaderProgram } from './ShaderProgram.js';
import vsSource_starfield from '../../../shaders/starfield/vertex.glsl';
import vsSource_miniImages from '../../../shaders/mini_images/vertex.glsl';
import fsSource_miniImages from '../../../shaders/mini_images/fragment.glsl';
import vsSource_highlights from '../../../shaders/highlights/vertex.glsl';
import fsSource_colorGrade from '../../../shaders/color_grade/fragment.glsl';
import vsSource_arrowImages from '../../../shaders/arrow_images/vertex.glsl';
import fsSource_arrowImages from '../../../shaders/arrow_images/fragment.glsl';
import fsSource_waterRipple from '../../../shaders/water_ripple/fragment.glsl';
import vsSource_colorTexture from '../../../shaders/color_texture/vertex.glsl';
import fsSource_colorTexture from '../../../shaders/color_texture/fragment.glsl';
import vsSource_colorInstanced from '../../../shaders/color/instanced/vertex.glsl';
import vsSource_boardUberShader from '../../../shaders/board_uber_shader/vertex.glsl';
import fsSource_boardUberShader from '../../../shaders/board_uber_shader/fragment.glsl';
import vsSource_textureInstanced from '../../../shaders/texture/instanced/vertex.glsl';
import fsSource_voronoiDistortion from '../../../shaders/voronoi_distortion/fragment.glsl';

// Types -----------------------------------------------------------------------

/** Every vertex attribute name across the shaders. */
export type AttributeName =
	| 'a_position'
	| 'a_color'
	| 'a_texturecoord'
	| 'a_instanceposition'
	| 'a_instancecolor'
	| 'a_instancerotation'
	| 'a_instancesize';

/** A shader drawn through a Renderable, which leaves its attribute and uniform names unchecked. */
type Program_Renderable = ShaderProgram<string, string>;

// Post Processing Shader Uniforms
type Uniforms_PostPass = 'u_sceneTexture';
type Uniforms_ColorGrade =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_brightness'
	| 'u_contrast'
	| 'u_gamma'
	| 'u_saturation'
	| 'u_tintColor'
	| 'u_hueOffset';
type Uniforms_Vignette =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_radius'
	| 'u_softness'
	| 'u_intensity';
type Uniforms_SineWave =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_amplitude'
	| 'u_frequency'
	| 'u_time'
	| 'u_angle';
type Uniforms_Water =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_sourceCount'
	| 'u_centers'
	| 'u_time'
	| 'u_resolution'
	| 'u_strength'
	| 'u_oscillationSpeed'
	| 'u_frequency';
type Uniforms_WaterRipple =
	| 'u_sceneTexture'
	| 'u_centers'
	| 'u_times'
	| 'u_dropletCount'
	| 'u_strength'
	| 'u_propagationSpeed'
	| 'u_oscillationSpeed'
	| 'u_frequency'
	| 'u_glintIntensity'
	| 'u_glintExponent'
	| 'u_falloff'
	| 'u_resolution';
type Uniforms_HeatWave =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_noiseTexture'
	| 'u_time'
	| 'u_strength'
	| 'u_resolution';
type Uniforms_VoronoiDistortion =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_time'
	| 'u_density'
	| 'u_strength'
	| 'u_ridgeThickness'
	| 'u_ridgeStrength'
	| 'u_resolution';
type Uniforms_Glitch =
	| 'u_sceneTexture'
	| 'u_masterStrength'
	| 'u_aberrationStrength'
	| 'u_aberrationOffset'
	| 'u_tearStrength'
	| 'u_tearResolution'
	| 'u_tearMaxDisplacement'
	| 'u_time'
	| 'u_resolution'
	| 'u_devicePixelRatio';

export interface ProgramMap {
	// --- Generic Shaders ---

	/** Renders meshes with colored vertices. */
	color: Program_Renderable;
	/** Instance renders a mesh with colored vertices. */
	colorInstanced: Program_Renderable;
	/** Renders a textured mesh. */
	texture: Program_Renderable;
	/** Instance renders a textured mesh. */
	textureInstanced: Program_Renderable;
	/** Renders a textured mesh with colored vertices. */
	colorTexture: Program_Renderable;

	// --- Specialized Shaders ---

	/** Renders mini images. */
	miniImages: Program_Renderable;
	/** Instance renders square highlights of a given size. */
	highlights: Program_Renderable;
	/** Renders arrows (not the images, but the arrow tip). */
	arrows: Program_Renderable;
	/** Renders arrow images. */
	arrowImages: Program_Renderable;
	/** Renders the starfield squares. */
	starfield: Program_Renderable;

	// --- Surface Level Effects ---

	/** Renders textured surfaces with a masked noise texture animated behind them. */
	board_uber_shader: Program_Renderable;

	// --- Post Processing Shaders ---

	/** Post Processing Pass-Through Shader. Zero effects. */
	post_pass: ShaderProgram<never, Uniforms_PostPass>;
	/** Post Processing Color Grading Shader. Several color effects. */
	color_grade: ShaderProgram<never, Uniforms_ColorGrade>;
	/** Post Processing Vignette Effect. */
	vignette: ShaderProgram<never, Uniforms_Vignette>;
	/** Post Processing Dual Axis Sine Wave Distortion Effect. */
	sine_wave: ShaderProgram<never, Uniforms_SineWave>;
	/** Post Processing Water Pond Distortion Effect. */
	water: ShaderProgram<never, Uniforms_Water>;
	/** Post Processing Water Ripple Distortion Effect. */
	water_ripple: ShaderProgram<never, Uniforms_WaterRipple>;
	/** Post Processing Heat Wave Distortion Effect. */
	heat_wave: ShaderProgram<never, Uniforms_HeatWave>;
	/** Post Processing Voronoi Cellular Noise Distortion Effect. */
	voronoi_distortion: ShaderProgram<never, Uniforms_VoronoiDistortion>;
	/** Post Processing Glitch Effect. */
	glitch: ShaderProgram<never, Uniforms_Glitch>;
}

/** The vertex and fragment shader source codes for a shader. */
type ShaderSource = {
	/** The vertex shader source code. */
	vertex: string;
	/** The fragment shader source code. */
	fragment: string;
};

// Constants -------------------------------------------------------------------

/** A mapping from program names to their corresponding shader sources. */
const SHADER_SOURCES: Record<keyof ProgramMap, ShaderSource> = {
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
	// Surface Level Effects
	board_uber_shader: { vertex: vsSource_boardUberShader, fragment: fsSource_boardUberShader },
	// Post Processing Shaders
	post_pass: { vertex: vsSource_postPass, fragment: fsSource_postPass },
	color_grade: { vertex: vsSource_postPass, fragment: fsSource_colorGrade },
	vignette: { vertex: vsSource_postPass, fragment: fsSource_vignette },
	sine_wave: { vertex: vsSource_postPass, fragment: fsSource_sineWave },
	water: { vertex: vsSource_postPass, fragment: fsSource_water },
	water_ripple: { vertex: vsSource_postPass, fragment: fsSource_waterRipple },
	heat_wave: { vertex: vsSource_postPass, fragment: fsSource_heatWave },
	voronoi_distortion: { vertex: vsSource_postPass, fragment: fsSource_voronoiDistortion },
	glitch: { vertex: vsSource_postPass, fragment: fsSource_glitch },
};

// Program Cache ---------------------------------------------------------------

/**
 * A factory and cache for creating and managing ShaderProgram instances.
 * Ensures that each shader program is only compiled and linked once.
 */
export class ProgramManager {
	private readonly gl: WebGL2RenderingContext;
	/** Compiled programs by name. The public `get` returns each as its own ProgramMap type. */
	private programCache: Map<keyof ProgramMap, ShaderProgram<string, string>> = new Map();

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
	}

	/**
	 * Retrieves a compiled and linked ShaderProgram from the cache, or creates it if it doesn't exist.
	 *
	 * @template K - The key (name) of the program to retrieve.
	 * @param programName - The name of the shader program (e.g., 'color', 'texture').
	 * @returns The ShaderProgram instance, typed per {@link ProgramMap}.
	 */
	public get<K extends keyof ProgramMap>(programName: K): ProgramMap[K] {
		// 1. Check if the program is already in the cache.
		if (this.programCache.has(programName)) {
			// We use a type assertion `as ProgramMap[K]` because we trust that the
			// internal cache is consistent with our public interface.
			return this.programCache.get(programName)! as ProgramMap[K];
		}

		// 2. If not, get the source code for the requested program.
		const sources = SHADER_SOURCES[programName];

		// 3. Create a new ShaderProgram instance.
		const program = new ShaderProgram(this.gl, sources.vertex, sources.fragment);

		// 4. Store it in the cache for future requests.
		this.programCache.set(programName, program);

		return program as ProgramMap[K];
	}
}
