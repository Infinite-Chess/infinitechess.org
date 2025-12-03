// src/client/scripts/esm/audio/processors/downsampler/DownsamplerProcessor.ts

import type { AudioParamDescriptor } from '../worklet-types';

/*
 * These need to be declared in every audio worklet processor file,
 * because apparently our typescript setup doesn't have the
 * AudioWorkletGlobalScope, and nothing I do will add it.
 */

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

/** Parameters for the DownsamplerProcessor. */
interface DownsamplerParameters extends Record<string, Float32Array> {
	downsampling: Float32Array;
}

/** An AudioWorkletProcessor that applies a downsampling (sample-and-hold) effect to audio. */
class DownsamplerProcessor extends AudioWorkletProcessor {
	static override get parameterDescriptors(): AudioParamDescriptor[] {
		return [
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
		parameters: DownsamplerParameters,
	): boolean {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || !output) return true; // Nothing to process

		const downsampling = parameters['downsampling'];

		for (let channel = 0; channel < input.length; ++channel) {
			const inputChannel = input[channel];
			const outputChannel = output[channel];
			if (!inputChannel || !outputChannel) continue;

			for (let i = 0; i < inputChannel.length; ++i) {
				const downsamplingValue =
					downsampling.length > 1 ? downsampling[i]! : downsampling[0]!;

				// Downsampling: Hold the last sample value for 'downsamplingValue' samples.
				if (this.phase % downsamplingValue < 1) this.lastSampleValue = inputChannel[i]!;

				// Output the held sample.
				outputChannel[i] = this.lastSampleValue;

				this.phase++;
			}
		}

		return true;
	}
}

registerProcessor('downsampler-processor', DownsamplerProcessor);
