
/**
 * This is the 1st zone you encounter moving away from the origin.
 * 
 * It has NO visual effect, but it does introduce the first ambience.
 */


import type { FilterConfig } from "../../../../audio/NoiseBuffer";
import type { Zone } from "../EffectZoneManager";

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { AmbienceController } from "../AmbienceController";


export class UndercurrentZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;

	/** The ambience controller for this zone. */
	private ambience: AmbienceController;


	constructor() {
		// Load the ambience...

		// Low wind
		const noiseConfig: FilterConfig[] = [
			// 1. Drastically cut almost all high frequencies. This does 90% of the work.
			// The very low Q makes the cutoff very gentle and "watery".
			{ type: 'lowpass', frequency: 200, Q: 1 },
			// 2. Add a sharp, whistling "whoosh" sound around 4500 Hz.
			// A high Q makes it sound more like a whistle than a general hiss.
			{ type: 'peaking', frequency: 4500, Q: 4, gain: 20 },
		];

		// const config = {
		// 	masterVolume: 1,
		// 	layers: [
		// 		{
		// 			volume: {
		// 				base: 1
		// 			},
		// 			source: {
		// 				type: "noise"
		// 			},
		// 			filters: [
		// 				{
		// 					type: "lowpass",
		// 					frequency: {
		// 						base: 136
		// 					},
		// 					Q: {
		// 						base: 1.0001
		// 					},
		// 					gain: {
		// 						base: 0
		// 					}
		// 				},
		// 				{
		// 					type: "lowpass",
		// 					frequency: {
		// 						base: 138
		// 					},
		// 					Q: {
		// 						base: 1.0001
		// 					},
		// 					gain: {
		// 						base: 0
		// 					}
		// 				}
		// 			]
		// 		}
		// 	]
		// };



		// Initialize the controller with the config.
		this.ambience = new AmbienceController(10, noiseConfig);
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
		this.ambience.fadeIn(transitionDurationMillis, 0.4); // Pass the target volume
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}