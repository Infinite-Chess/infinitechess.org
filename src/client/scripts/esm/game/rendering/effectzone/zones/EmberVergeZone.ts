// src/client/scripts/esm/game/rendering/effectzone/zones/EmberVergeZone.ts

/**
 * A sheen of golds and ember reds drifting across the board, light and dark
 * tiles shifted apart in hue.
 */

import { ColorFlowZone } from '../ColorFlowZone';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';

export class EmberVergeZone extends ColorFlowZone {
	constructor() {
		super({
			effectType: 11,
			// prettier-ignore
			colors: [
				[0.92, 0.82, 0.62], // Faded Gold
				[0.6, 0.8, 0.6],    // Muted Green
				[0.5, 0.7, 0.9],    // Muted Blue
				[0.8, 0.5, 0.8],    // Muted Purple
				[0.88, 0.22, 0.15], // Molten Orange-Red
				[0.78, 0.05, 0.05], // Ashfall Core Red
			],
			strength: 0.5,
			maskOffset: 0.07,
		});

		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}
}
