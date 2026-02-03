// src/client/scripts/esm/game/rendering/effect_zone/zones/SpectralEdgeZone.ts

import type { Zone } from '../EffectZoneManager';

// @ts-ignore
import loadbalancer from '../../../misc/loadbalancer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';
import IridescenceSoundscape from '../soundscapes/IridescenceSoundscape';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import { SoundscapeConfig, SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class SpectralEdgeZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 4;

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
	private strength: number = 0.3;

	/** The base speed at which the gradient texture scrolls across the screen. */
	private flowSpeed: number = 0.07; // Default: 0.07

	/** The speed at which the flow direction changes over time, in radians per second. */
	private flowRotationSpeed: number = 0.0025; // Default: 0.0025

	/** How many times the full gradient repeats across the screen along the direction of flow. */
	private gradientRepeat: number = 0.7; // Default: 1.2

	/** The phase shift applied to the light tiles' gradient, as a percentage of the gradient's total length. */
	private maskOffset: number = 0.07; // Default: 0.06

	// --- State Properties ---

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;

	constructor() {
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.25,
			layers: [
				// Undercurrent layer
				{
					// Custom volume
					volume: {
						base: 0.8,
					},
					source: UndercurrentSoundscape.source,
					filters: UndercurrentSoundscape.filters,
				},
				// Partial of Iridescence layers
				...IridescenceSoundscape.layers12,
			],
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
		// Pre-calculate the direction vector
		const flowDirectionVec: [number, number] = [
			Math.cos(this.flowDirection),
			Math.sin(this.flowDirection),
		];

		const flowDistance = (performance.now() / 1000) * this.flowSpeed;

		const uniforms: Record<string, any> = {
			u4_flowDistance: flowDistance,
			u4_flowDirectionVec: flowDirectionVec,
			u4_gradientRepeat: this.gradientRepeat,
			u4_maskOffset: this.maskOffset,
			u4_strength: this.strength,
		};

		// Add each color as a separate uniform.
		for (let i = 0; i < this.colors.length; i++) {
			// Use the color if it exists, otherwise pad with black.
			const color = this.colors[i] || [0, 0, 0];
			uniforms[`u4_color${i + 1}`] = color;
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
