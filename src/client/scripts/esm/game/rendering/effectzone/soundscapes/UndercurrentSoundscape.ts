// src/client/scripts/esm/game/rendering/effectzone/soundscapes/UndercurrentSoundscape.ts

/**
 * A shared soundscape used by several zones: a deep, steady rumble.
 *
 * Exported both as a finished soundscape and in pieces, since some zones play
 * it as-is while others layer it underneath sounds of their own.
 */

import { LayerConfig } from '../../../../audio/SoundLayer.js';
import { SoundscapeConfig } from '../../../../audio/SoundscapePlayer.js';

/** The source of the Undercurrent soundscape layer is white noise. */
const source: LayerConfig['source'] = {
	type: 'noise',
};

/** The filters of the Undercurrent soundscape layer. */
const filters: LayerConfig['filters'] = [
	{
		type: 'lowpass',
		frequency: {
			base: 136,
		},
		Q: {
			base: 1,
		},
		gain: {
			base: 0,
		},
	},
	{
		type: 'lowpass',
		frequency: {
			base: 138,
		},
		Q: {
			base: 1,
		},
		gain: {
			base: 0,
		},
	},
];

/** The complete configuration for the Undercurrent soundscape. */
const config: SoundscapeConfig = {
	masterVolume: 0.36,
	layers: [
		{
			volume: {
				base: 1,
			},
			source,
			filters,
		},
	],
};

export default {
	source,
	filters,
	config,
};
