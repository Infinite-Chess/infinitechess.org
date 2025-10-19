
// src/client/scripts/esm/audio/processors/bitcrusher/BitcrusherProcessor.ts

import type { AudioParamDescriptor } from "../worklet-types";

class BitcrusherProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors(): AudioParamDescriptor[] {
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
		parameters: Record<string, Float32Array>
	): boolean {
		const input = inputs[0];
		const output = outputs[0];
		const bitDepth = parameters.bitDepth;
		const downsampling = parameters.downsampling;

		for (let channel = 0; channel < input.length; ++channel) {
			const inputChannel = input[channel];
			const outputChannel = output[channel];

			for (let i = 0; i < inputChannel.length; ++i) {
				const bitDepthValue = bitDepth.length > 1 ? bitDepth[i] : bitDepth[0];
				const downsamplingValue = downsampling.length > 1 ? downsampling[i] : downsampling[0];

				// Downsampling
				if (this.phase % downsamplingValue < 1) this.lastSampleValue = inputChannel[i];
        
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