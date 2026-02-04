// src/client/scripts/esm/webgl/post_processing/passes/PassThroughPass.ts

import type { PostProcessPass } from '../PostProcessingPipeline';
import type { ProgramManager, ProgramMap } from '../../ProgramManager';

/**
 * A Post Processing Pass Through Effect, with zero effects.
 * Only required if we have no other effects.
 */
export class PassThroughPass implements PostProcessPass {
	readonly program: ProgramMap['post_pass'];

	/**
	 * A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect.
	 * HAS NO EFFECT IN THE PASS THROUGH PASS.
	 */
	public masterStrength: number = 1.0;

	constructor(programManager: ProgramManager) {
		this.program = programManager.get('post_pass');
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		this.program.use();

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
	}
}
