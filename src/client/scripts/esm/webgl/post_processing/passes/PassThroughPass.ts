
import { ProgramManager, ProgramMap } from "../../ProgramManager";
import { PostProcessPass } from "../PostProcessingPipeline";


/**
 * A Post Processing Pass Through Effect, with zero effects.
 * Only required if we have no other effects.
 */
export class PassThroughPass implements PostProcessPass {
	readonly program: ProgramMap['post_pass'];

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('post_pass');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);
		
		const location = this.program.getUniformLocation('u_sceneTexture');
		gl.uniform1i(location, 0);
	}
}