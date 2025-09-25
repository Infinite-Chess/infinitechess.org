import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";

/**
 * A post-processing pass that applies a rising, shimmering heat distortion effect.
 */
export class HeatWavePass implements PostProcessPass {
	readonly program: ProgramMap['heat_wave'];
	private noiseTexture: WebGLTexture;

	/** The strength of the distortion effect. Default: 0.04 (time = performance.now() / 500) */
	public strength: number = 0.04;

	/** The current time, used to animate the waves. Increment this each frame. */
	public time: number = 0.0;


	constructor(programManager: ProgramManager, noiseTexture: WebGLTexture) {
		this.program = programManager.get('heat_wave');
		this.noiseTexture = noiseTexture;
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		// 1. Bind the scene texture from the pipeline to TEXTURE UNIT 0
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		// 2. Bind our own noise texture to TEXTURE UNIT 1
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);

		// 3. Set the uniforms, telling the shader which texture unit to use for each
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0); // Use unit 0
		gl.uniform1i(this.program.getUniformLocation('u_noiseTexture'), 1); // Use unit 1
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
	}
}