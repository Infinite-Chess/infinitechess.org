// src/client/scripts/esm/game/rendering/effectzone/zones/UndercurrentZone.ts

/**
 * This is the 1st zone you encounter moving away from the origin.
 *
 * It has NO visual effect, but it does introduce the first ambience.
 */

import type { UniformValue } from '../../../../webgl/Renderable';

import { BaseZone } from '../BaseZone';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';

export class UndercurrentZone extends BaseZone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;

	constructor() {
		super();
		// Load the ambience...

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}

	public update(): void {
		// No dynamic state to update for a pass-through zone.
	}

	public getUniforms(): Record<string, UniformValue> {
		return {};
	}
}
