
// src/client/scripts/esm/audio/SoundLayer.ts

/**
 * This module implements the audio graph for individual sound layers within a soundscape.
 * 
 * A sound layer could either be:
 * - A noise source (e.g. white noise) with filters applied.
 * - An oscillator source (e.g. sine wave) with filters applied.
 * 
 * Each layer can have its own volume control, and each parameter can be modulated by an LFO.
 */

import { createLFO, LFOConfig } from "./LFOFactory";


// Type Definitions ------------------------------------------------------------------


/** A single sound layer within a soundscape. */
export interface LayerConfig {
	volume: ModulatedParamConfig;
	source: SourceConfig;
	filters: FilterConfig[];
}

/** The configuration for the audio source of a layer. */
export type SourceConfig = NoiseSourceConfig | OscillatorSourceConfig;

/** Configuration for a noise source. */
export interface NoiseSourceConfig {
	type: 'noise';
}

/** Configuration for an oscillator source with optional LFO modulation. */
interface OscillatorSourceConfig {
	type: 'oscillator';
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
	freq: ModulatedParamConfig;
	detune: ModulatedParamConfig;
}

/** Configuration for a BiquadFilterNode with optional LFO modulation. */
interface FilterConfig {
	/** The type of BiquadFilter to create. */
	type: BiquadFilterType;
	/** Where on the frequency spectrum the filter should work. */
	frequency: ModulatedParamConfig;
	/**
	 * The Q factor (resonance) of the filter. Optional.
	 * Range: 0.0001 to 1000. Default: 1.
	 */
	Q: ModulatedParamConfig;
	/**
	 * The gain of the filter, in dB. Optional.
	 * Only used for certain filter types: peaking, lowshelf, highshelf.
	 */
	gain: ModulatedParamConfig;
}

/** Configuration for a parameter that can be modulated by an LFO. */
interface ModulatedParamConfig {
	base: number;
	lfo?: LFOConfig;
}


// SoundLayer Class ----------------------------------------------------------------


/**
 * Represents the complete audio graph for a single layer in a soundscape.
 */
export class SoundLayer {
	private readonly outputGain: GainNode;
	/** All unique oscillators and LFOs that need to be started and stopped for this layer. */
	private readonly allNodesToStart: (AudioBufferSourceNode | OscillatorNode)[] = [];


	constructor(context: AudioContext, config: LayerConfig, sharedNoiseSource: AudioBufferSourceNode) {
		this.outputGain = context.createGain();
		this.outputGain.gain.value = config.volume.base;

		if (config.volume.lfo) { // The volume for this layer is modulated by an LFO
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
		// FUTURE: Potentially upgrade to start perlin noise buffers at random
		// offsets so they don't sound identical every refresh.
		this.allNodesToStart.forEach(node => node.start(0));
	}

	/** Stops all unique oscillators and LFOs for this layer. */
	public stop(): void {
		this.allNodesToStart.forEach(node => node.stop(0));
	}
}