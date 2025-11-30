import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass that applies a single-axis sine wave distortion,
 * creating a "rolling hills" or flag-waving effect.
 */
export class RollingHillsPass implements PostProcessPass {
	readonly program: ProgramMap['rolling_hills'];

	// --- Public Properties to Control the Effect ---

	/** The strength of the wave (how far pixels are displaced). */
	public amplitude: number = 0.1;

	/** The number of full waves across the screen. */
	public frequency: number = 1.0;

	/** The angle of the wave crests in degrees. 0 creates vertical waves, 90 creates horizontal waves. */
	public angle: number = 0.0;

	/** The current time, used to animate the waves. */
	public time: number = 0.0;

	
	constructor(programManager: ProgramManager) {
		this.program = programManager.get('rolling_hills');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		// Convert user-friendly degrees to radians for the shader
		const angleInRadians = this.angle * (Math.PI / 180.0);
		
		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_amplitude'), this.amplitude);
		gl.uniform1f(this.program.getUniformLocation('u_frequency'), this.frequency);
		gl.uniform1f(this.program.getUniformLocation('u_angle'), angleInRadians);
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time);
	}
}