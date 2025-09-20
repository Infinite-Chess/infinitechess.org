
import { ProgramMap } from "../../ProgramManager";
import { PostProcessPass } from "../PostProcessingPipeline";


/** The shader program this pass through uses. */
type PassThroughProgram = ProgramMap['post_pass'];

/**
 * A Post Processing Pass Through Effect, with zero effects.
 * Only required if we have no other effects.
 */
export class PassThroughPass implements PostProcessPass {
	readonly program: PassThroughProgram;

	constructor(program: PassThroughProgram) {
		this.program = program;
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		const location = this.program.getUniformLocation('u_sceneTexture');
		gl.uniform1i(location, 0);
	}
}