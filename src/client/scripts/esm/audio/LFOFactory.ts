// src/client/scripts/esm/audio/LFOFactory.ts

/**
 * A factory for creating Low-Frequency Oscillator (LFO) units for modulating audio parameters.
 */

import PerlinNoise from '../util/PerlinNoise';

/** Configuration for a low-frequency oscillator (LFO) modulating a parameter. */
export interface LFOConfig {
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'perlin';
	rate: number;
	depth: number;
}

/** A container for an LFO's audio nodes. */
interface LFOUnit {
	source: AudioNode;
	gain: GainNode;
}

/** A shared AudioBuffer for Perlin noise LFOs to use. */
let perlinNoiseBuffer: AudioBuffer | null = null;

/**
 * A factory for creating LFO (Low-Frequency Oscillator) units.
 * @param context The global AudioContext.
 * @param config The configuration for the LFO.
 * @returns An LFOUnit containing the necessary source and gain nodes.
 */
export function createLFO(context: AudioContext, config: LFOConfig): LFOUnit {
	const lfoGain = context.createGain();
	lfoGain.gain.value = config.depth;

	let lfoSource: AudioNode;
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
		// Create the perlin noise buffer only once
		const duration = 30; // 30 seconds long buffer
		const sampleCount = context.sampleRate * duration;

		// The "zoom" level for the noise. Higher values = smoother/slower noise.
		const noiseZoom = 50000;
		const noisePeriod = Math.ceil(sampleCount / noiseZoom);
		// console.log("noisePeriod: ", noisePeriod); // We get about 1 second of looping per 1 noise period at 1.0 rate.
		const noiseGenerator = PerlinNoise.create1DNoiseGenerator(noisePeriod);

		perlinNoiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate);
		const data = perlinNoiseBuffer.getChannelData(0);
		for (let i = 0; i < sampleCount; i++) {
			data[i] = noiseGenerator(i / noiseZoom);
		}
	}
	const lfoSource = context.createBufferSource();
	lfoSource.buffer = perlinNoiseBuffer;
	lfoSource.loop = true;
	lfoSource.playbackRate.value = rate;
	return lfoSource;
}
