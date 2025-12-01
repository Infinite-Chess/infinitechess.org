// src/client/scripts/esm/game/rendering/effect_zone/zones/EmberVergeZone.ts

import type { Zone } from '../EffectZoneManager';

// @ts-ignore
import loadbalancer from '../../../misc/loadbalancer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class EmberVergeZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 11;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	// --- Configurable Properties ---

	// prettier-ignore
	private readonly colors: [number, number, number][] = [
		[0.92, 0.82, 0.62], // Faded Gold
		[0.6, 0.8, 0.6],    // Muted Green
		[0.5, 0.7, 0.9],    // Muted Blue
		[0.8, 0.5, 0.8],    // Muted Purple
		[0.88, 0.22, 0.15], // Molten Orange-Red
		[0.78, 0.05, 0.05], // Ashfall Core Red
	];

	/** Determines how strongly the gradient colors are blended with the original board tile colors. */
	private strength: number = 0.5;

	/** The base speed at which the gradient texture scrolls across the screen. */
	private flowSpeed: number = 0.07;

	/** The speed at which the flow direction changes over time, in radians per second. */
	private flowRotationSpeed: number = 0.0025;

	/** How many times the full gradient repeats across the screen along the direction of flow. */
	private gradientRepeat: number = 0.7;

	/** The phase shift applied to the light tiles' gradient, as a percentage of the gradient's total length. */
	private maskOffset: number = 0.07;

	// --- State Properties ---

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;

	constructor() {
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
		// Pre-calculate the direction vector
		const flowDirectionVec: [number, number] = [
			Math.cos(this.flowDirection),
			Math.sin(this.flowDirection),
		];

		const flowDistance = (performance.now() / 1000) * this.flowSpeed;

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
