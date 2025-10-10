
import { createLFO } from "./LFOFactory";
import { LayerConfig, OscillatorSourceConfig } from "./SoundscapePlayer";

/**
 * Represents the complete audio graph for a single layer in a soundscape.
 */
export class SoundLayer {
	
	// private readonly sourceNode: AudioNode;
	private readonly outputGain: GainNode;
	/** All unique oscillators and LFOs that need to be started and stopped. */
	private readonly allNodesToStart: (AudioBufferSourceNode | OscillatorNode)[] = [];

	constructor(context: AudioContext, config: LayerConfig, sharedNoiseSource: AudioBufferSourceNode) {
		this.outputGain = context.createGain();
		this.outputGain.gain.value = config.volume.base;

		if (config.volume.lfo) {
			const lfo = createLFO(context, config.volume.lfo);
			lfo.source.connect(lfo.gain).connect(this.outputGain.gain);
			this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
		}

		let currentNode: AudioNode;

		if (config.source.type === 'noise') {
			currentNode = sharedNoiseSource;
			// The shared noise source is managed by the player, so we don't add it to our start/stop list.
		} else { // type === 'oscillator'
			const oscConfig: OscillatorSourceConfig = config.source;
			const osc = context.createOscillator();
			osc.type = oscConfig.wave;
			osc.frequency.value = oscConfig.freq.base;
			osc.detune.value = oscConfig.detune.base;

			if (oscConfig.freq.lfo) {
				const lfo = createLFO(context, oscConfig.freq.lfo);
				lfo.source.connect(lfo.gain).connect(osc.frequency);
				this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
			}
			if (oscConfig.detune.lfo) {
				const lfo = createLFO(context, oscConfig.detune.lfo);
				lfo.source.connect(lfo.gain).connect(osc.detune);
				this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
			}
			
			currentNode = osc;
			this.allNodesToStart.push(osc);
		}

		config.filters.forEach(filterConfig => {
			const filterNode = context.createBiquadFilter();
			filterNode.type = filterConfig.type;
			filterNode.frequency.value = filterConfig.frequency.base;
			filterNode.Q.value = filterConfig.Q.base;
			filterNode.gain.value = filterConfig.gain.base;

			if (filterConfig.frequency.lfo) {
				const lfo = createLFO(context, filterConfig.frequency.lfo);
				lfo.source.connect(lfo.gain).connect(filterNode.frequency);
				this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
			}
			if (filterConfig.Q.lfo) {
				const lfo = createLFO(context, filterConfig.Q.lfo);
				lfo.source.connect(lfo.gain).connect(filterNode.Q);
				this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
			}
			if (filterConfig.gain.lfo) {
				const lfo = createLFO(context, filterConfig.gain.lfo);
				lfo.source.connect(lfo.gain).connect(filterNode.gain);
				this.allNodesToStart.push(lfo.source as OscillatorNode | AudioBufferSourceNode);
			}

			currentNode.connect(filterNode);
			currentNode = filterNode;
		});

		currentNode.connect(this.outputGain);
	}

	/** Connects this layer's output to a destination node. */
	public connect(destination: AudioNode): void {
		this.outputGain.connect(destination);
	}

	/** Starts all unique oscillators and LFOs for this layer. */
	public start(): void {
		this.allNodesToStart.forEach(node => node.start(0));
	}

	/** Stops all unique oscillators and LFOs for this layer. */
	public stop(): void {
		this.allNodesToStart.forEach(node => node.stop(0));
	}
}