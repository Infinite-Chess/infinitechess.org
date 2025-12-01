import { LayerConfig } from '../../../../audio/SoundLayer';
import { SoundscapeConfig } from '../../../../audio/SoundscapePlayer';

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
