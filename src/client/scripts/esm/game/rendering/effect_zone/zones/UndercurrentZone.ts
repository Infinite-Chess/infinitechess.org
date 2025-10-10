
/**
 * This is the 1st zone you encounter moving away from the origin.
 * 
 * It has NO visual effect, but it does introduce the first ambience.
 */


import type { FilterConfig } from "../../../../audio/NoiseBuffer";
import type { Zone } from "../EffectZoneManager";

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";


export class UndercurrentZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;


	constructor() {
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 1,
			layers: [
				{
					volume: {
						base: 1
					},
					source: {
						type: "noise"
					},
					filters: [
						{
							type: "lowpass",
							frequency: {
								base: 136
							},
							Q: {
								base: 1.0001
							},
							gain: {
								base: 0
							}
						},
						{
							type: "lowpass",
							frequency: {
								base: 138
							},
							Q: {
								base: 1.0001
							},
							gain: {
								base: 0
							}
						}
					]
				}
			]
		};

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(noiseConfig);
	}


	public update(): void {
		// No dynamic state to update for a pass-through zone.
	}
    
	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [];
	}

	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(0.4, transitionDurationMillis); // Pass the target volume
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}