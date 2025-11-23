
// src/client/scripts/esm/webgl/post_processing/passes/WaterPass.ts

import type { ProgramManager, ProgramMap } from "../../ProgramManager";
import type { PostProcessPass } from "../PostProcessingPipeline";

/** Defines a single ripple's source point. */
export interface RippleSource {
	/** The center of the source in UV coordinates [0-1, 0-1]. */
	center: [number, number];
}

/**
 * A post-processing pass that simulates a pond-like surface with ripples
 * emanating from various source points. The ripples are radial sine waves
 * with constant intensity.
 */
export class WaterPass implements PostProcessPass {
	readonly program: ProgramMap['water'];
	private static readonly MAX_SOURCES = 10; // MUST match the shader constant

	// --- Public Properties to Control the Effect ---

	/** A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect. */
	public masterStrength: number = 1.0;

	/** The overall strength and visibility of the distortion. */
	public strength: number = 0.001;
	/** How fast the waves oscillate or "bob" up and down, in cycles per second. */
	public oscillationSpeed: number = 8.0;
	/** The density of the rings in the ripple, in waves per UV unit. */
	public frequency: number = 40.0;
	/** The current time, used to animate the waves. Should be updated each frame. */
	public time: number = 0.0;

	// --- Internal State ---
	private activeSources: RippleSource[] = [];
	private resolution: [number, number] = [1, 1];
	// Pre-allocated array for performance to avoid creating new arrays every frame
	private centersArray: Float32Array = new Float32Array(WaterPass.MAX_SOURCES * 2);


	/**
	 * Creates a new PondPass.
	 * @param programManager - The ProgramManager instance to retrieve the shader program.
	 * @param width - The current width of the canvas.
	 * @param height - The current height of the canvas.
	 */
	constructor(programManager: ProgramManager, width: number, height: number) {
		this.program = programManager.get('water');
		this.setResolution(width, height);
	}

	/**
	 * Updates the pass with the current list of active ripple sources.
	 * Call this every frame.
	 * @param sources An array of active source points.
	 */
	public updateSources(sources: RippleSource[]): void {
		// Clamp the number of sources to the maximum allowed by the shader
		const count = Math.min(sources.length, WaterPass.MAX_SOURCES);
		this.activeSources = sources.slice(0, count);
	}

	/**
	 * Informs the pass of the current rendering resolution.
	 * This is crucial for correcting aspect ratio distortion.
	 * Call this whenever the canvas is resized.
	 * @param width The width of the canvas.
	 * @param height The height of the canvas.
	 */
	public setResolution(width: number, height: number): void {
		this.resolution[0] = width;
		this.resolution[1] = height;
	}

	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		// --- 1. Prepare uniform data ---
		const sourceCount = this.activeSources.length;
		for (let i = 0; i < sourceCount; i++) {
			const source = this.activeSources[i]!;
			this.centersArray[i * 2 + 0] = source.center[0];
			this.centersArray[i * 2 + 1] = source.center[1];
		}

		// --- 2. Set uniforms and render ---
		this.program.use();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1f(this.program.getUniformLocation('u_masterStrength'), this.masterStrength);
		gl.uniform1i(this.program.getUniformLocation('u_sourceCount'), sourceCount);
		gl.uniform1f(this.program.getUniformLocation('u_time'), this.time / 1000); // Convert ms to seconds
		gl.uniform2fv(this.program.getUniformLocation('u_resolution'), this.resolution);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
		gl.uniform1f(this.program.getUniformLocation('u_frequency'), this.frequency);
		gl.uniform1f(this.program.getUniformLocation('u_oscillationSpeed'), this.oscillationSpeed);

		if (sourceCount > 0) {
			// Use subarray to only send data for active sources
			gl.uniform2fv(this.program.getUniformLocation('u_centers'), this.centersArray.subarray(0, sourceCount * 2));
		}
	}
}