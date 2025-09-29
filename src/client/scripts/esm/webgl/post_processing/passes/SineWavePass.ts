
// src/client/scripts/esm/webgl/post_processing/passes/SineWavePass.ts

import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass that applies a double-axis sine wave distortion to the image.
 */
export class SineWavePass implements PostProcessPass {
	readonly program: ProgramMap['sine_wave'];

	// --- Public Properties to Control the Effect ---
	
	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/** The strength of the wave on the [x, y] axes. */
	public amplitude: [number, number] = [0.003, 0.003];

	/** The number of full waves across the screen on the [x, y] axes. */
	public frequency: [number, number] = [2.0, 2.0];

	/** The angle of the primary wave axis in degrees. The second wave is perpendicular. */
	public angle: number = 0.0;

	/** The current time, used to animate the waves. Increment this each frame. */
	public time: number = 0.0;


	constructor(programManager: ProgramManager) {
		this.program = programManager.get('sine_wave');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Convert angle from degrees to radians for the shader
		const angleInRadians = this.angle * (Math.PI / 180.0);
		
		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);
		gl.uniform2fv(this.program.getUniformLocation('u_amplitude'), this.amplitude);
		gl.uniform2fv(this.program.getUniformLocation('u_frequency'), this.frequency);
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time);
		gl.uniform1f(this.program.getUniformLocation('u_angle'), angleInRadians);
	}
}
