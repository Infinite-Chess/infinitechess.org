
// src/client/scripts/esm/game/rendering/effect_zone/zones/ChromaticFlowZone.ts

// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { Zone } from "../EffectZoneManager";
import { SoundscapePlayer } from "../../../../audio/SoundscapePlayer";
import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";


export class ChromaticFlowZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 9;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	// --- Configurable Properties ---

	/** The array of RGB colors that defines the gradient. Passed to the shader. */
	private readonly colors: [number, number, number][] = [
		[1.0, 0.5, 0.5], // Soft Red
		[1.0, 1.0, 0.5], // Soft Yellow
		[0.5, 1.0, 0.5], // Soft Green
		[0.5, 1.0, 1.0], // Soft Cyan
		[0.5, 0.5, 1.0], // Soft Blue
		[1.0, 0.5, 1.0], // Soft Magenta
	];

	/** Determines how strongly the gradient colors are blended with the original board tile colors. */
	private strength: number = 0.5;

	/** The base speed at which the gradient texture scrolls across the screen. */
	private flowSpeed: number = 0.05;

	/** The speed at which the flow direction changes over time, in radians per second. */
	private flowRotationSpeed: number = 0.02;

	/** How many times the full gradient repeats across the screen along the direction of flow. */
	private gradientRepeat: number = 1.2;

	/** The phase shift applied to the light tiles' gradient, as a percentage of the gradient's total length. */
	private maskOffset: number = 0.1;


	// --- State Properties ---

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;

	/** A single float representing the total distance the wave has traveled along its direction. */
	private flowDistance: number = 0.0;


	constructor() {
		// Using the Undercurrent soundscape ambience.
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}


	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime(); // In seconds

		// Rotate the flow direction over time.
		this.flowDirection += this.flowRotationSpeed * deltaTime;
		if (this.flowDirection > Math.PI * 2) this.flowDirection -= Math.PI * 2;
		else if (this.flowDirection < 0) this.flowDirection += Math.PI * 2;
	}

	public getUniforms(): Record<string, any> {
		// Pre-calculate the direction vector ONCE on the CPU.
		const flowDirectionVec: [number, number] = [
			Math.cos(this.flowDirection),
			Math.sin(this.flowDirection)
		];
		
		// Flatten the colors array for the shader uniform.
		const flattenedColors = this.colors.flat();

		const flowDistance = performance.now() / 1000 * this.flowSpeed;

		return {
			// --- Chromatic Flow Uniforms (Effect Type 9) ---
			u9_numColors: this.colors.length,
			u9_colors: flattenedColors,
			u9_flowDistance: flowDistance,
			u9_flowDirectionVec: flowDirectionVec,
			u9_gradientRepeat: this.gradientRepeat,
			u9_maskOffset: this.maskOffset,
			u9_strength: this.strength,
		};
	}

	public getPasses(): PostProcessPass[] {
		// This zone does not use any post-processing passes.
		return [];
	}
    
	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}