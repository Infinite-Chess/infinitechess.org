// src/client/scripts/esm/audio/LFOFactory.ts

/**
 * A factory for creating Low-Frequency Oscillator (LFO) units for modulating audio parameters.
 */

import PerlinNoise from '../util/PerlinNoise';

// Types -----------------------------------------------------------------------

/** Configuration for a low-frequency oscillator (LFO) modulating a parameter. */
export interface LFOConfig {
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'perlin';
	rate: number;
	depth: number;
}

/** A container for an LFO's audio nodes. */
interface LFOUnit {
	/** Always a startable source, so callers can schedule it alongside their own nodes. */
	source: OscillatorNode | AudioBufferSourceNode;
	gain: GainNode;
}

// Constants -------------------------------------------------------------------

/** Length of the shared Perlin noise buffer, in seconds. Longer = less repetition, more memory. */
const PERLIN_BUFFER_DURATION_SECS = 30;

/** The "zoom" level for the Perlin noise. Higher = smoother/slower noise. */
const PERLIN_NOISE_ZOOM = 50000;

// State -----------------------------------------------------------------------

/** A shared AudioBuffer for Perlin noise LFOs to use. Built on first use. */
let perlinNoiseBuffer: AudioBuffer | null = null;

// LFO Creation ----------------------------------------------------------------

/**
 * A factory for creating LFO (Low-Frequency Oscillator) units.
 * @param context The global AudioContext.
 * @param config The configuration for the LFO.
 * @returns An LFOUnit containing the necessary source and gain nodes.
 */
export function createLFO(context: AudioContext, config: LFOConfig): LFOUnit {
	const lfoGain = context.createGain();
	lfoGain.gain.value = config.depth;

	let lfoSource: OscillatorNode | AudioBufferSourceNode;
	if (config.wave === 'perlin') {
		lfoSource = createPerlinLFO(context, config.rate);
	} else {
		const osc = context.createOscillator();
		osc.type = config.wave;
		osc.frequency.value = config.rate;
		lfoSource = osc;
	}

	return { source: lfoSource, gain: lfoGain };
}

/** Creates a looping AudioBufferSourceNode that outputs Perlin noise. */
function createPerlinLFO(context: AudioContext, rate: number): AudioBufferSourceNode {
	if (!perlinNoiseBuffer) {
		const sampleCount = context.sampleRate * PERLIN_BUFFER_DURATION_SECS;
		// About 1 second of looping per noise period at 1.0 rate.
		const noisePeriod = Math.ceil(sampleCount / PERLIN_NOISE_ZOOM);
		const noiseGenerator = PerlinNoise.create1DNoiseGenerator(noisePeriod);

		perlinNoiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
		const data = perlinNoiseBuffer.getChannelData(0);
		for (let i = 0; i < sampleCount; i++) {
			data[i] = noiseGenerator(i / PERLIN_NOISE_ZOOM);
		}
	}
	const lfoSource = context.createBufferSource();
	lfoSource.buffer = perlinNoiseBuffer;
	lfoSource.loop = true;
	lfoSource.playbackRate.value = rate;
	return lfoSource;
}
