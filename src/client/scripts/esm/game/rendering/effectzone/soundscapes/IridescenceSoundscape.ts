// src/client/scripts/esm/game/rendering/effectzone/soundscapes/IridescenceSoundscape.ts

/**
 * A shared soundscape used by the Iridescence and Spectral Edge zones:
 * four harmonic ringing tones.
 *
 * Exported as two pairs, low and high, so Spectral Edge can take just the low pair.
 */

import type { LayerConfig } from '../../../../audio/SoundLayer.js';

/** The first two layers of the Iridescence soundscape (lower pitch). */
const layers12: LayerConfig[] = [
	{
		volume: {
			base: 0.015,
		},
		source: {
			type: 'noise',
		},
		filters: [
			{
				type: 'bandpass',
				frequency: {
					base: 418,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
			{
				type: 'lowpass',
				frequency: {
					base: 418,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
		],
	},
	{
		volume: {
			base: 0.12,
		},
		source: {
			type: 'noise',
		},
		filters: [
			{
				type: 'bandpass',
				frequency: {
					base: 631,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
			{
				type: 'bandpass',
				frequency: {
					base: 631,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
		],
	},
];

/** The third and fourth layers of the Iridescence soundscape (higher pitch). */
const layers34: LayerConfig[] = [
	{
		volume: {
			base: 0.2,
		},
		source: {
			type: 'noise',
		},
		filters: [
			{
				type: 'bandpass',
				frequency: {
					base: 851,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
			{
				type: 'bandpass',
				frequency: {
					base: 850,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
		],
	},
	{
		volume: {
			base: 0.02,
		},
		source: {
			type: 'noise',
		},
		filters: [
			{
				type: 'bandpass',
				frequency: {
					base: 1714,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
			{
				type: 'bandpass',
				frequency: {
					base: 1715,
				},
				Q: {
					base: 29.9901,
				},
				gain: {
					base: 0,
				},
			},
		],
	},
];

export default {
	layers12,
	layers34,
};
