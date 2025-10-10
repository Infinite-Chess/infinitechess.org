
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

		// Define the recipe for the noise.
		const noiseConfig: FilterConfig[] = [
			{ type: 'lowpass', frequency: 500, Q: 1.5 },
			{ type: 'peaking', frequency: 120, Q: 2, gain: 8 },
			{ type: 'highpass', frequency: 50, Q: 1.0 }
		];

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