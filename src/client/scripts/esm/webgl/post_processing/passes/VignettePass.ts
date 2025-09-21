
import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass for applying a vignette effect,
 * darkening the corners of the image.
 */
export class VignettePass implements PostProcessPass {
	readonly program: ProgramMap['vignette'];

	// --- Public Properties to Control the Effect ---

	/** The inner radius of the vignette, where darkening begins. Default is 0.3. */
	public radius: number = 0.3;

	/** The softness of the vignette's edge. Default is 0.5. */
	public softness: number = 0.5;

	/** The strength of the darkening effect. 1.0 is fully black. Default is 0.8. */
	public intensity: number = 0.8;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('vignette');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		// Set all the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_radius'), this.radius);
		gl.uniform1f(this.program.getUniformLocation('u_softness'), this.softness);
		gl.uniform1f(this.program.getUniformLocation('u_intensity'), this.intensity);
	}
}