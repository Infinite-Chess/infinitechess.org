
// src/client/scripts/esm/effects/zones/AmbienceController.ts

/**
 * This class manages a single ambience sound, including loading, playing, and fading it in and out.
 */


import type { FilterConfig } from "../../../audio/NoiseBuffer";

import NoisePlayer, { INoisePlayer } from "../../../audio/NoisePlayer";


export class AmbienceController {

	/** A promise resolving to the ambience noise player, once created. */
	private noisePlayerPromise: Promise<INoisePlayer> | undefined = undefined;
	/** Whether we should cancel any pending fade-in of the ambience. */
	private cancelAmbienceFadeIn: boolean = false;
	
	private readonly durationSecs: number;
	private readonly filterConfigs: FilterConfig[];

	/**
	 * Creates a controller for a single ambient sound.
	 * @param durationSecs The duration of the looping audio buffer.
	 * @param filterConfigs The configuration for the noise sound.
	 */
	constructor(durationSecs: number, filterConfigs: FilterConfig[]) {
		this.durationSecs = durationSecs;
		this.filterConfigs = filterConfigs;
	}

	/**
	 * Gets the noise player, creating it if it doesn't exist yet.
	 * This ensures the expensive player creation only ever happens once.
	 */
	private getNoisePlayer(): Promise<INoisePlayer> {
		// If the promise doesn't exist, create it.
		if (!this.noisePlayerPromise) {
			this.noisePlayerPromise = NoisePlayer.create(this.durationSecs, this.filterConfigs).then(player => {
				player.start();
				return player;
			});
		}
		
		return this.noisePlayerPromise;
	}

	/** Fades in the ambience, creating and starting the player if needed. */
	public async fadeIn(transitionDurationMillis: number, targetVolume: number): Promise<void> {
		this.cancelAmbienceFadeIn = false; // Clear any pending fade-in cancellation.

		// Get the player. This will either return the existing promise or create a new one.
		// The await handles waiting for initialization to complete.
		const noisePlayer = await this.getNoisePlayer();

		// If a fade-out was requested while we were awaiting, bail out.
		if (this.cancelAmbienceFadeIn) return;
		
		// Now fade in the ambience.
		noisePlayer.fadeIn(targetVolume, transitionDurationMillis);
	}

	/** Fades out the ambience. It will remain playing at zero volume until stopped. */
	public async fadeOut(transitionDurationMillis: number): Promise<void> {
		this.cancelAmbienceFadeIn = true; // Terminate any pending fade-in.

		// If the player hasn't even started initializing, there's nothing to fade out.
		if (!this.noisePlayerPromise) return;

		// Await the player to ensure it's initialized before trying to fade it out.
		const player = await this.noisePlayerPromise;
		player.fadeOut(transitionDurationMillis);
	}
}