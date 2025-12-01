// src/client/scripts/esm/audio/processors/bitcrusher/BitcrusherProcessor.ts

import type { AudioParamDescriptor } from '../worklet-types';

/*
 * These need to be declared in every audio worklet processor file,
 * because apparently our typescript setup doesn't have the
 * AudioWorkletGlobalScope, and nothing I do will add it.
 */

/* eslint-disable no-unused-vars */
declare abstract class AudioWorkletProcessor {
	static get parameterDescriptors(): AudioParamDescriptor[];
	constructor(options?: any);
	abstract process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: Record<string, Float32Array>,
	): boolean;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
/* eslint-enable no-unused-vars */

/** Parameters for the BitcrusherProcessor. */
interface BitcrusherParameters extends Record<string, Float32Array> {
	bitDepth: Float32Array;
	downsampling: Float32Array;
}

/** An AudioWorkletProcessor that applies a bitcrusher and/or downsampling effect to audio. */
class BitcrusherProcessor extends AudioWorkletProcessor {
	static override get parameterDescriptors(): AudioParamDescriptor[] {
		return [
			{
				name: 'bitDepth',
				defaultValue: 8,
				minValue: 1,
				maxValue: 16,
				automationRate: 'k-rate',
			},
			{
				name: 'downsampling',
				defaultValue: 1,
				minValue: 1,
				maxValue: 40,
				automationRate: 'k-rate',
			},
		];
	}

	private phase = 0;
	private lastSampleValue = 0;

	process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: BitcrusherParameters,
	): boolean {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || !output) return true; // Nothing to process

		const bitDepth = parameters['bitDepth'];
		const downsampling = parameters['downsampling'];

		for (let channel = 0; channel < input.length; ++channel) {
			const inputChannel = input[channel];
			const outputChannel = output[channel];
			if (!inputChannel || !outputChannel) continue;

			for (let i = 0; i < inputChannel.length; ++i) {
				const bitDepthValue = bitDepth.length > 1 ? bitDepth[i]! : bitDepth[0]!;
				const downsamplingValue =
					downsampling.length > 1 ? downsampling[i]! : downsampling[0]!;

				// Downsampling
				if (this.phase % downsamplingValue < 1) this.lastSampleValue = inputChannel[i]!;

				// Bit-depth reduction
				const step = Math.pow(0.5, bitDepthValue);
				outputChannel[i] = step * Math.floor(this.lastSampleValue / step + 0.5);

				this.phase++;
			}
		}

		return true;
	}
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);
