
// src/client/scripts/esm/game/rendering/effect_zone/zones/EmberVergeZone.ts

import type { Zone } from "../EffectZoneManager";

// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";


export class EmberVergeZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 11;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	// --- Configurable Properties ---

	private readonly colors: [number, number, number][] = [
		[0.92, 0.82, 0.62], // Faded Gold — washed-out warmth from rainbow land
		[0.82, 0.65, 0.50], // Dusty Amber — dryness and subtle heat
		[0.72, 0.50, 0.38], // Smolder Clay — earthy warmth increasing
		[0.82, 0.38, 0.22], // Emberflare Orange — glowing ember tones
		[0.88, 0.22, 0.15], // Molten Orange-Red — heat intensifies sharply
		[0.78, 0.05, 0.05], // Ashfall Core Red — near-lava transition
	];

	/** Determines how strongly the gradient colors are blended with the original board tile colors. */
	private strength: number = 0.7;

	/** The base speed at which the gradient texture scrolls across the screen. */
	private flowSpeed: number = 0.07; // Default: 0.07

	/** The speed at which the flow direction changes over time, in radians per second. */
	private flowRotationSpeed: number = 0.0025; // Default: 0.0025

	/** How many times the full gradient repeats across the screen along the direction of flow. */
	private gradientRepeat: number = 0.7;

	/** The phase shift applied to the light tiles' gradient, as a percentage of the gradient's total length. */
	private maskOffset: number = 0.07;


	// --- State Properties ---

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;



	constructor() {
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = UndercurrentSoundscape.config;

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(noiseConfig);
	}


	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime(); // In seconds

		// Rotate the flow direction over time.
		this.flowDirection += this.flowRotationSpeed * deltaTime;
		if (this.flowDirection > Math.PI * 2) this.flowDirection -= Math.PI * 2;
		else if (this.flowDirection < 0) this.flowDirection += Math.PI * 2;
	}

	public getUniforms(): Record<string, any> {
		// Pre-calculate the direction vector
		const flowDirectionVec: [number, number] = [
			Math.cos(this.flowDirection),
			Math.sin(this.flowDirection)
		];
		
		const flowDistance = performance.now() / 1000 * this.flowSpeed;

		const uniforms: Record<string, any> = {
			u11_flowDistance: flowDistance,
			u11_flowDirectionVec: flowDirectionVec,
			u11_gradientRepeat: this.gradientRepeat,
			u11_maskOffset: this.maskOffset,
			u11_strength: this.strength,
		};

		// Add each color as a separate uniform.
		for (let i = 0; i < this.colors.length; i++) {
			// Use the color if it exists, otherwise pad with black.
			const color = this.colors[i] || [0, 0, 0];
			uniforms[`u11_color${i + 1}`] = color;
		}

		return uniforms;
	}

	public getPasses(): PostProcessPass[] {
		return [];
	}
	
	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}