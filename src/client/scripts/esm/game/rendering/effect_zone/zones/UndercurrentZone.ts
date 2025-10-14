
/**
 * This is the 1st zone you encounter moving away from the origin.
 * 
 * It has NO visual effect, but it does introduce the first ambience.
 */


import type { Zone } from "../EffectZoneManager";

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { SoundscapePlayer } from "../../../../audio/SoundscapePlayer";
import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";


export class UndercurrentZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;


	constructor() {
		// Load the ambience...

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
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
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}