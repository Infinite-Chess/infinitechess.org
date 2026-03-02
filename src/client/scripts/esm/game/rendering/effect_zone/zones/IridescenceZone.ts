// src/client/scripts/esm/game/rendering/effect_zone/zones/IridescenceZone.ts

import type { Zone } from '../EffectZoneManager';

import loadbalancer from '../../../misc/loadbalancer';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import IridescenceSoundscape from '../soundscapes/IridescenceSoundscape';
import { SoundscapeConfig, SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class IridescenceZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 5;

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
	private strength: number = 1;

	/** The base speed at which the gradient texture scrolls across the screen. */
	private flowSpeed: number = 0.07; // Default: 0.07

	/** The speed at which the flow direction changes over time, in radians per second. */
	private flowRotationSpeed: number = 0.0025; // Default: 0.0025

	/** How many times the full gradient repeats across the screen along the direction of flow. */
	private gradientRepeat: number = 0.7; // Default: 1.2

	/** The phase shift applied to the light tiles' gradient, as a percentage of the gradient's total length. */
	private maskOffset: number = 0.06; // Default: 0.06

	// --- State Properties ---

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;

	constructor() {
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.33,
			layers: [...IridescenceSoundscape.layers12, ...IridescenceSoundscape.layers34],
		};

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
		// Pre-calculate the direction vector.
		const flowDirectionVec: [number, number] = [
			Math.cos(this.flowDirection),
			Math.sin(this.flowDirection),
		];

		const flowDistance = (performance.now() / 1000) * this.flowSpeed;

		const uniforms: Record<string, any> = {
			u5_flowDistance: flowDistance,
			u5_flowDirectionVec: flowDirectionVec,
			u5_gradientRepeat: this.gradientRepeat,
			u5_maskOffset: this.maskOffset,
			u5_strength: this.strength,
		};

		// Add each color as a separate uniform.
		for (let i = 0; i < this.colors.length; i++) {
			// Use the color if it exists, otherwise pad with black.
			const color = this.colors[i] || [0, 0, 0];
			uniforms[`u5_color${i + 1}`] = color;
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
