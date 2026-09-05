// src/client/scripts/esm/game/rendering/effectzone/zones/SpectralEdgeZone.ts

/**
 * A faint rainbow sheen drifting across the board, light and dark tiles
 * shifted apart in hue. Iridescence, turned right down.
 */

import { ColorFlowZone } from '../ColorFlowZone';
import IridescenceSoundscape from '../soundscapes/IridescenceSoundscape';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';
import { SoundscapeConfig, SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class SpectralEdgeZone extends ColorFlowZone {
	constructor() {
		super({
			effectType: 4,
			// prettier-ignore
			colors: [
				[1.0, 0.5, 0.5], // Soft Red
				[1.0, 1.0, 0.5], // Soft Yellow
				[0.5, 1.0, 0.5], // Soft Green
				[0.5, 1.0, 1.0], // Soft Cyan
				[0.5, 0.5, 1.0], // Soft Blue
				[1.0, 0.5, 1.0], // Soft Magenta
			],
			strength: 0.3,
			maskOffset: 0.07,
		});

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.25,
			layers: [
				// Undercurrent layer, at a custom volume
				{
					volume: { base: 0.8 },
					source: UndercurrentSoundscape.source,
					filters: UndercurrentSoundscape.filters,
				},
				// Partial of Iridescence layers
				...IridescenceSoundscape.layers12,
			],
		};
		this.ambience = new SoundscapePlayer(noiseConfig);
	}
}
