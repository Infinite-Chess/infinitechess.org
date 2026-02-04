// src/client/scripts/esm/webgl/post_processing/passes/VoronoiDistortionPass.ts

import type { PostProcessPass } from '../PostProcessingPipeline';
import type { ProgramManager, ProgramMap } from '../../ProgramManager';

/**
 * A post-processing pass that distorts the image based on an animated
 * Voronoi cellular noise pattern.
 */
export class VoronoiDistortionPass implements PostProcessPass {
	readonly program: ProgramMap['voronoi_distortion'];

	// --- Public Properties to Control the Effect ---

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/** The current time, used to animate the cells. Increment this each frame. */
	public time: number = 0.0;

	/** The density of the Voronoi cells. */
	public density: number = 3.5;

	/** The strength of the cells' distortion. */
	public strength: number = 0.007;

	/** The thickness of the ridges between cells. */
	public ridgeThickness = 0.02;

	/** The strength of the ridges' lensing effect. */
	public ridgeStrength = 0.04;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('voronoi_distortion');
	}

	// prettier-ignore
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
		gl.uniform1f(this.program.getUniformLocation('u_density'), this.density);
		gl.uniform1f(this.program.getUniformLocation('u_ridgeThickness'), this.ridgeThickness);
		gl.uniform1f(this.program.getUniformLocation('u_ridgeStrength'), this.ridgeStrength);
		gl.uniform2f(this.program.getUniformLocation('u_resolution'), gl.canvas.width, gl.canvas.height);
	}
}
