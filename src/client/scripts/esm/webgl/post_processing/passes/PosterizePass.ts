
import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";

/**
 * A post-processing pass that reduces the number of colors in the scene
 * to create a "posterized" effect.
 */
export class PosterizePass implements PostProcessPass {
	readonly program: ProgramMap['posterize'];

	// --- Public Properties for Control ---

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/**
	 * The number of distinct color levels per channel (red, green, blue).
	 * A value of 4, for example, means each channel can only be one of 4 values.
	 * Set 1 or less to effectively disable the effect.
	 */
	public levels: number = 8;


	constructor(programManager: ProgramManager) {
		this.program = programManager.get('posterize');
	}

	/**
	 * Renders the posterization effect.
	 * @param gl - The WebGL2 rendering context.
	 * @param inputTexture - The texture to process (usually the output of the previous pass).
	 */
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();

		// Bind the input texture to texture unit 0
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Set the uniforms for the shader
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);
		gl.uniform1f(this.program.getUniformLocation('u_levels'), this.levels);
	}
}