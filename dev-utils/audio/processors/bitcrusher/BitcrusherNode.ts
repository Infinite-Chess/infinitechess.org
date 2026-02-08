// dev-utils/audio/processors/bitcrusher/BitcrusherNode.ts

export class BitcrusherNode extends AudioWorkletNode {
	constructor(context: AudioContext) {
		super(context, 'bitcrusher-processor');
	}

	/**
	 * Factory method to asynchronously create and initialize a BitcrusherNode.
	 * @param context The AudioContext to create the node in.
	 * @param workletUrl The URL to the compiled bitcrusher-processor.js file.
	 * @returns A promise that resolves with a fully initialized BitcrusherNode instance.
	 */
	public static async create(context: AudioContext): Promise<BitcrusherNode> {
		try {
			// Load the worklet processor from the specified URL
			await context.audioWorklet.addModule(
				'scripts/esm/audio/processors/bitcrusher/BitcrusherProcessor.js',
			);
			// Once loaded, create an instance of the node
			return new BitcrusherNode(context);
		} catch (e) {
			console.error('Failed to load bitcrusher audio worklet', e);
			throw e;
		}
	}

	/**
	 * The number of bits to quantize the audio signal to.
	 * Range: 1 to 16. Lower = more distortion.
	 */
	get bitDepth(): AudioParam | undefined {
		return this.parameters.get('bitDepth');
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
