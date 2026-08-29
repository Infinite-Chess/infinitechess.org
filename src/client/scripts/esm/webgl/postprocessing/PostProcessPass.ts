// src/client/scripts/esm/webgl/postprocessing/PostProcessPass.ts

import type { ShaderProgram } from '../ShaderProgram';

/** A Post Processing Effect applied to the whole screen after rendering the scene. */
export interface PostProcessPass {
	/** The shader program this pass uses. */
	readonly program: ShaderProgram<string, string>;

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	masterStrength: number;

	/**
	 * Executes the render pass.
	 * This method is responsible for activating the shader and setting its uniforms.
	 * @param gl The WebGL2 rendering context.
	 * @param inputTexture The texture to read from (the result of the previous pass).
	 */
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void;
}
