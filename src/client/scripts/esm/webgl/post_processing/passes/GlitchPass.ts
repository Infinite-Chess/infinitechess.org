// src/client/scripts/esm/webgl/post_processing/passes/GlitchPass.ts

import type { ProgramManager, ProgramMap } from '../../ProgramManager';
import type { PostProcessPass } from '../PostProcessingPipeline';

/**
 * A post-processing pass that applies a glitch effect,
 * combining horizontal tearing and chromatic aberration.
 */
export class GlitchPass implements PostProcessPass {
	readonly program: ProgramMap['glitch'];

	// --- Public Properties to Control the Effect ---

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/** The strength of the chromatic aberration. */
	public aberrationStrength: number = 0.0;
	/** The direction and magnitude of the color channel separation for chromatic aberration in virtual CSS pixels. */
	public aberrationOffsetPixels: [number, number] = [10.0, 0.0];

	/** The strength of the horizontal tearing. */
	public tearStrength: number = 0.0;
	/** The height of individual tear lines in virtual CSS pixels. */
	public tearResolution: number = 16.0;
	/** The maximum horizontal displacement for a tear in virtual CSS pixels. */
	public tearMaxDisplacement: number = 20.0;

	/** The current time, used to animate the glitch patterns. Increment this each frame. */
	public time: number = 0.0;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('glitch');
	}

	// prettier-ignore
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();

		// Bind the scene texture from the pipeline to TEXTURE UNIT 0
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);

		// Chromatic Aberration Uniforms
		gl.uniform1f(this.program.getUniformLocation('u_aberrationStrength'), this.aberrationStrength);

		// Convert the aberration offset to UV space
		const uvAberrationOffset: [number, number] = [
			this.aberrationOffsetPixels[0] * window.devicePixelRatio / gl.canvas.width,
			this.aberrationOffsetPixels[1] * window.devicePixelRatio / gl.canvas.height,
		];
		gl.uniform2fv(this.program.getUniformLocation('u_aberrationOffset'), uvAberrationOffset);

		// Horizontal Tearing Uniforms
		gl.uniform1f(this.program.getUniformLocation('u_tearStrength'), this.tearStrength);
		gl.uniform1f(this.program.getUniformLocation('u_tearResolution'), this.tearResolution);
		gl.uniform1f(this.program.getUniformLocation('u_tearMaxDisplacement'), this.tearMaxDisplacement);
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time);
		gl.uniform2f(this.program.getUniformLocation('u_resolution'), gl.canvas.width, gl.canvas.height);
		gl.uniform1f(this.program.getUniformLocation('u_devicePixelRatio'), window.devicePixelRatio);
	}
}
