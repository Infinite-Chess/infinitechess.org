
import { ProgramManager, ProgramMap } from "../../ProgramManager";
import { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A post-processing pass for applying color grading effects.
 * Initially supports saturation.
 */
export class ColorGradePass implements PostProcessPass {
	readonly program: ProgramMap['color_grade'];

	/** The saturation level. 0.0 is grayscale, 1.0 is original color. */
	public saturation: number = 1.0;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('color_grade');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		// Bind the input texture to texture unit 0
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		// Set the uniforms
		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_saturation'), this.saturation);
	}
}