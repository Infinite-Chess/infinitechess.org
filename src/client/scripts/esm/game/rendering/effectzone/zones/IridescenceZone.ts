// src/client/scripts/esm/game/rendering/effectzone/zones/IridescenceZone.ts

/**
 * A strong rainbow sheen drifting across the board, light and dark tiles
 * shifted apart in hue.
 */

import { ColorFlowZone } from '../ColorFlowZone';
import IridescenceSoundscape from '../soundscapes/IridescenceSoundscape';
import { SoundscapeConfig, SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class IridescenceZone extends ColorFlowZone {
	constructor() {
		super({
			effectType: 5,
			// prettier-ignore
			colors: [
				[1.0, 0.5, 0.5], // Soft Red
				[1.0, 1.0, 0.5], // Soft Yellow
				[0.5, 1.0, 0.5], // Soft Green
				[0.5, 1.0, 1.0], // Soft Cyan
				[0.5, 0.5, 1.0], // Soft Blue
				[1.0, 0.5, 1.0], // Soft Magenta
			],
			strength: 1,
			maskOffset: 0.06,
		});

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.33,
			layers: [...IridescenceSoundscape.layers12, ...IridescenceSoundscape.layers34],
		};
		this.ambience = new SoundscapePlayer(noiseConfig);
	}
}
