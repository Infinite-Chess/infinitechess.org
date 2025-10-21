
// src/client/scripts/esm/audio/processors/downsampler/DownsamplerNode.ts

export class DownsamplerNode extends AudioWorkletNode {
	constructor(context: AudioContext) {
		super(context, 'downsampler-processor');
	}

	/**
     * Factory method to asynchronously create and initialize a DownsamplerNode.
     * @param context The AudioContext to create the node in.
     * @returns A promise that resolves with a fully initialized DownsamplerNode instance.
     */
	public static async create(context: AudioContext): Promise<DownsamplerNode> {
		try {
			// Load the worklet processor from the specified URL
			await context.audioWorklet.addModule('scripts/esm/audio/processors/downsampler/DownsamplerProcessor.js');
			// Once loaded, create an instance of the node
			return new DownsamplerNode(context);
		} catch (e) {
			console.error('Failed to load downsampler audio worklet', e);
			throw e;
		}
	}

	/**
     * The factor by which to reduce the sample rate.
     * A value of 1 means no downsampling.
     * Range: 1 to 40.
     */
	get downsampling(): AudioParam | undefined {
		return this.parameters.get('downsampling');
	}
}