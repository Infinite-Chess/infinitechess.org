// src/client/scripts/esm/webgl/post_processing/passes/WaterRipplePass.ts

import type { PostProcessPass } from '../PostProcessingPipeline';
import type { ProgramManager, ProgramMap } from '../../ProgramManager';

/** A simple structure to define a single droplet's state. */
export interface RippleState {
	/** The center of the droplet in UV coordinates [0-1, 0-1]. */
	center: [number, number];
	/** The time snapshot in millseconds the ripple was created. */
	timeCreated: number;
}

/**
 * A post-processing pass that simulates multiple water droplet ripples on the screen.
 */
export class WaterRipplePass implements PostProcessPass {
	readonly program: ProgramMap['water_ripple'];
	private static readonly MAX_DROPLETS = 20; // MUST match the shader constant

	// --- Global Effect Controls ---

	/**
	 * A master control for the strength of the entire pass. 0.0 is off, 1.0 is full effect.
	 * HAS NO EFFECT ON THE WATER RIPPLE PASS.
	 */
	public masterStrength: number = 1.0;

	/** The overall strength and visibility of the distortion. */
	public strength: number = 0.06; // Default: 0.06
	/** How fast the ripple's leading edge expands outwards, in UV units per second. */
	public propagationSpeed: number = 2.0;
	/** How fast the internal waves oscillate or "bob" up and down. */
	public oscillationSpeed: number = 40.0;
	/** The density of the rings in the ripple, in waves per UV unit. */
	public frequency: number = 50.0;
	/** How sharply the trailing waves decay. Hhigher values create a shorter tail. */
	public falloff: number = 200.0;

	/** The brightness of the white glow on the wave crests. */
	public glintIntensity: number = 0.5;
	/** The sharpness of the glint; higher values create a smaller, tighter highlight. */
	public glintExponent: number = 7.0;

	// --- Internal State ---
	private activeDroplets: RippleState[] = [];
	private resolution: [number, number] = [1, 1];
	// Pre-allocated arrays for performance to avoid creating new arrays every frame
	private centersArray: Float32Array = new Float32Array(WaterRipplePass.MAX_DROPLETS * 2);
	private timesArray: Float32Array = new Float32Array(WaterRipplePass.MAX_DROPLETS);

	/**
	 * Creates a new WaterRipplePass.
	 * @param programManager - The ProgramManager instance to retrieve shader programs.
	 * @param width - The current width of the canvas.
	 * @param height - The current height of the canvas.
	 */
	constructor(programManager: ProgramManager, width: number, height: number) {
		this.program = programManager.get('water_ripple');
		this.setResolution(width, height);
	}

	/**
	 * Updates the pass with the current list of active droplets.
	 * Call this every frame from your main application loop.
	 * @param droplets An array of active droplet states.
	 */
	public updateDroplets(droplets: RippleState[]): void {
		// Clamp the number of droplets to the maximum allowed by the shader
		const count = Math.min(droplets.length, WaterRipplePass.MAX_DROPLETS);
		this.activeDroplets = droplets.slice(-count); // Keep the most recent droplets
	}

	/**
	 * Informs the pass of the current rendering resolution.
	 * This is crucial for correcting aspect ratio distortion,
	 * preventing ripples from not being circular on non-square screens.
	 * Call this whenever the canvas is resized.
	 * @param width The width of the canvas.
	 * @param height The height of the canvas.
	 */
	public setResolution(width: number, height: number): void {
		this.resolution[0] = width;
		this.resolution[1] = height;
	}

	// prettier-ignore
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void {
		const now = Date.now();

		// --- 1. Prepare uniform data ---
		const dropletCount = this.activeDroplets.length;
		for (let i = 0; i < dropletCount; i++) {
			const droplet = this.activeDroplets[i]!;
			this.centersArray[i * 2 + 0] = droplet.center[0];
			this.centersArray[i * 2 + 1] = droplet.center[1];
			this.timesArray[i] = (now - droplet.timeCreated) / 1000; // Convert to seconds
		}

		// --- 2. Set uniforms and render ---
		this.program.use();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, inputTexture);

		gl.uniform1i(this.program.getUniformLocation('u_sceneTexture'), 0);
		gl.uniform1i(this.program.getUniformLocation('u_dropletCount'), dropletCount);
		gl.uniform1f(this.program.getUniformLocation('u_strength'), this.strength);
		gl.uniform1f(this.program.getUniformLocation('u_propagationSpeed'), this.propagationSpeed);
		gl.uniform1f(this.program.getUniformLocation('u_oscillationSpeed'), this.oscillationSpeed);
		gl.uniform1f(this.program.getUniformLocation('u_frequency'), this.frequency);
		gl.uniform1f(this.program.getUniformLocation('u_falloff'), this.falloff);
		gl.uniform1f(this.program.getUniformLocation('u_glintIntensity'), this.glintIntensity);
		gl.uniform1f(this.program.getUniformLocation('u_glintExponent'), this.glintExponent);
		gl.uniform2fv(this.program.getUniformLocation('u_resolution'), this.resolution);

		if (dropletCount > 0) {
			// Use subarray to only send data for active droplets
			gl.uniform2fv(this.program.getUniformLocation('u_centers'), this.centersArray.subarray(0, dropletCount * 2));
			gl.uniform1fv(this.program.getUniformLocation('u_times'), this.timesArray.subarray(0, dropletCount));
		}
	}
}
