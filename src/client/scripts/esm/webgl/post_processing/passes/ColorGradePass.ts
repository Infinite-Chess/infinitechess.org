import type { ProgramManager, ProgramMap } from '../../ProgramManager';
import type { PostProcessPass } from '../PostProcessingPipeline';

/**
 * A post-processing pass for applying a full suite of color grading effects.
 */
export class ColorGradePass implements PostProcessPass {
	readonly program: ProgramMap['color_grade'];

	// --- Public Properties to Control the Effect ---

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/** Adjusts overall brightness. 0.0 is no change. */
	public brightness: number = 0.0;

	/** Adjusts contrast. 1.0 is no change. */
	public contrast: number = 1.0;

	/**
	 * Adjusts mid-tones. 1.0 is no change.
	 * MUST BE > 0!
	 */
	public gamma: number = 1.0;

	/** Adjusts color intensity. 1.0 is no change, 0.0 is grayscale. */
	public saturation: number = 1.0;

	/** Tints the scene with a color. [1, 1, 1] is no change. */
	public tint: [number, number, number] = [1.0, 1.0, 1.0];

	/** Rotates all colors. 0.0 is no change, wraps at 1.0. */
	public hueOffset: number = 0.0;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('color_grade');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();

		// Bind the input texture to texture unit 0
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);
		gl.uniform1f(this.program.getUniformLocation('u_brightness'), this.brightness);
		gl.uniform1f(this.program.getUniformLocation('u_contrast'), this.contrast);
		gl.uniform1f(this.program.getUniformLocation('u_gamma'), this.gamma);
		gl.uniform1f(this.program.getUniformLocation('u_saturation'), this.saturation);
		gl.uniform3fv(this.program.getUniformLocation('u_tintColor'), this.tint);
		gl.uniform1f(this.program.getUniformLocation('u_hueOffset'), this.hueOffset);
	}
}
