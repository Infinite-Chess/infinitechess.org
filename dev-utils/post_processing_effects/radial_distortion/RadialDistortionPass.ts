import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass that applies radial distortion.
 * Used for both barrel and pincushion effects.
 */
export class RadialDistortionPass implements PostProcessPass {
	readonly program: ProgramMap['radial_distortion'];

	// --- Public Properties to Control the Effect ---

	/**
	 * The strength of the distortion.
	 * Positive values create a barrel (bulging) effect.
	 * Negative values create a pincushion (pinching) effect.
	 */
	public strength: number = 0.0;

	/** The center of the distortion, in UV coordinates [0, 1]. */
	public center: [number, number] = [0.5, 0.5];


	constructor(programManager: ProgramManager) {
		this.program = programManager.get('radial_distortion');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
		gl.uniform2fv(this.program.getUniformLocation('u_center'), this.center);
	}
}