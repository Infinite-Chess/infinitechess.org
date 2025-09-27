
// src/client/scripts/esm/webgl/post_processing/passes/VoronoiDistortionPass.ts

import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass that distorts the image based on an animated
 * Voronoi cellular noise pattern.
 */
export class VoronoiDistortionPass implements PostProcessPass {
	readonly program: ProgramMap['voronoi_distortion'];

	// --- Public Properties to Control the Effect ---

	/** The maximum strength of the distortion. Default is 0.02 */
	public strength: number = 0.02;

	/** The density of the Voronoi cells. Default is 10.0 */
	public density: number = 10.0;
    
	/** The speed of the animation. Default is 0.1 */
	public speed: number = 0.1;

	/** The current time, used to animate the cells. Increment this each frame. */
	public time: number = 0.0;


	constructor(programManager: ProgramManager) {
		this.program = programManager.get('voronoi_distortion');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform2f(this.program.getUniformLocation('u_resolution'), gl.canvas.width, gl.canvas.height);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
		gl.uniform1f(this.program.getUniformLocation('u_density'), this.density);
		// Combine time and speed for the shader
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time * this.speed);
	}
}