// src/client/scripts/esm/audio/AudioEffects.ts

/**
 * This module is responsible for creating and managing audio effects using the Web Audio API.
 */

// Types ---------------------------------------------------------------------------------------------

/** A wrapper containing the input and output nodes of an effect graph. */
export interface NodeChain {
	input: AudioNode;
	output: AudioNode;
}

/** The base configuration for any effect. */
interface EffectConfigBase {
	/**
	 * The volume of the "wet" (processed) signal. Default: 1.
	 */
	wetLevel?: number;
	/**
	 * The volume of the "dry" (original) signal. Default: 0.
	 * Increase to allow some of the original signal to pass through unaffected.
	 */
	dryLevel?: number;
}

/** The configuration for a single effect in the effects chain. */
export type EffectConfig = EffectConfigBase & { type: 'reverb'; durationSecs: number };
// Future effects will be added here, e.g.:
// | { type: 'filter', filterType: BiquadFilterType, frequency: number }

// Effect Creation ---------------------------------------------------------------------------------

/**
 * Creates a complete, wrapped effect node graph based on the provided configuration.
 * @param audioContext - The global audio context.
 * @param config - The configuration object for the effect.
 * @returns An EffectWrapper containing the input and output nodes of the effect graph.
 */
export function createEffectNode(audioContext: AudioContext, config: EffectConfig): NodeChain {
	// 1. Create the core effect node based on its type.
	let coreEffectNode: AudioNode;

	switch (config.type) {
		case 'reverb': {
			coreEffectNode = generateConvolverNode(audioContext, config.durationSecs);
			break;
		}
		// When you add a filter:
		// case 'filter': {
		// 	coreEffectNode = audioContext.createBiquadFilter();
		// 	coreEffectNode.type = config.filterType;
		// 	coreEffectNode.frequency.value = config.frequency;
		// 	break;
		// }
		default:
			throw new Error(`Unknown effect type specified in config.`);
	}

	// 2. Create the input and output nodes for parallel dry and wet signal paths.
	const input = new GainNode(audioContext);
	const output = new GainNode(audioContext);

	// Determine the dry level. Default to 0 (0% passthrough) if not specified.
	const dryLevel = config.dryLevel === undefined ? 0 : Math.max(0, config.dryLevel);
	if (dryLevel > 0) {
		const dryGain = new GainNode(audioContext, { gain: dryLevel });
		input.connect(dryGain).connect(output);
	}

	// Determine the wet level. Default to 1 (100% effect) if not specified.
	const wetLevel = config.wetLevel === undefined ? 1 : Math.max(0, config.wetLevel);
	if (wetLevel > 0) {
		const wetGain = new GainNode(audioContext, { gain: wetLevel });
		input.connect(coreEffectNode).connect(wetGain).connect(output);
	}

	// 3. Return the wrapped effect node.
	return { input, output };
}

// Internal Helpers --------------------------------------------------------------------------------

/** Generates a reverb effect node. */
function generateConvolverNode(audioContext: AudioContext, durationSecs: number): ConvolverNode {
	const impulse = impulseResponse(audioContext, durationSecs);
	return new ConvolverNode(audioContext, { buffer: impulse });
}

/** The mathematical function used by the convolver (reverb) node used to calculate the reverb effect! */
function impulseResponse(audioContext: AudioContext, duration: number): AudioBuffer {
	// Duration in seconds, decay
	const decay = 2;
	const sampleRate = audioContext.sampleRate;
	const length = sampleRate * duration;
	const impulse = audioContext.createBuffer(1, length, sampleRate);
	const IR = impulse.getChannelData(0);
	for (let i = 0; i < length; i++)
		IR[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length, decay);
	return impulse;
}
