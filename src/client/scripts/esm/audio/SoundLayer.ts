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

import { createLFO, LFOConfig } from './LFOFactory';

// Types -----------------------------------------------------------------------

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
export interface OscillatorSourceConfig {
	type: 'oscillator';
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
	freq: ModulatedParamConfig;
	detune: ModulatedParamConfig;
}

/** Configuration for a BiquadFilterNode with optional LFO modulation. */
export interface FilterConfig {
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

// SoundLayer Class ------------------------------------------------------------

/** Represents the complete audio graph for a single layer in a soundscape. */
export class SoundLayer {
	private readonly outputGain: GainNode;
	/** All unique oscillators and LFOs that need to be started and stopped for this layer. */
	private readonly allNodesToStart: (AudioBufferSourceNode | OscillatorNode)[] = [];

	constructor(
		context: AudioContext,
		config: LayerConfig,
		sharedNoiseSource: AudioBufferSourceNode,
	) {
		this.outputGain = context.createGain();
		this.outputGain.gain.value = config.volume.base;
		this.modulate(context, config.volume, this.outputGain.gain);

		const source = this.createSource(context, config.source, sharedNoiseSource);
		const chainEnd = this.buildFilterChain(context, config.filters, source);
		chainEnd.connect(this.outputGain);
	}

	/**
	 * Rides an LFO on top of an AudioParam, if the config asks for one.
	 * The param's base value must already be set — the LFO offsets it rather than replacing it.
	 */
	private modulate(context: AudioContext, config: ModulatedParamConfig, param: AudioParam): void {
		if (!config.lfo) return;
		const lfo = createLFO(context, config.lfo);
		lfo.source.connect(lfo.gain).connect(param);
		this.allNodesToStart.push(lfo.source);
	}

	/** Creates this layer's source: the shared noise source, or an oscillator of its own. */
	private createSource(
		context: AudioContext,
		config: SourceConfig,
		sharedNoiseSource: AudioBufferSourceNode,
	): AudioNode {
		// The player manages the shared noise source, so we don't start/stop it here.
		if (config.type === 'noise') return sharedNoiseSource;

		const osc = context.createOscillator();
		osc.type = config.wave;
		osc.frequency.value = config.freq.base;
		osc.detune.value = config.detune.base;
		this.modulate(context, config.freq, osc.frequency);
		this.modulate(context, config.detune, osc.detune);

		this.allNodesToStart.push(osc);
		return osc;
	}

	/** Chains the filters onto the source in series, returning the last node of the chain. */
	private buildFilterChain(
		context: AudioContext,
		configs: FilterConfig[],
		source: AudioNode,
	): AudioNode {
		let currentNode: AudioNode = source;

		for (const config of configs) {
			const filter = context.createBiquadFilter();
			filter.type = config.type;
			filter.frequency.value = config.frequency.base;
			filter.Q.value = config.Q.base;
			filter.gain.value = config.gain.base;
			this.modulate(context, config.frequency, filter.frequency);
			this.modulate(context, config.Q, filter.Q);
			this.modulate(context, config.gain, filter.gain);

			currentNode.connect(filter);
			currentNode = filter;
		}

		return currentNode;
	}

	/** Connects this layer's output to a destination node. */
	public connect(destination: AudioNode): void {
		this.outputGain.connect(destination);
	}

	/** Starts all unique oscillators and LFOs for this layer. */
	public start(): void {
		// FUTURE: Potentially upgrade to start perlin noise buffers at random
		// offsets so they don't sound identical every refresh.
		this.allNodesToStart.forEach((node) => node.start(0));
	}

	/** Stops all unique oscillators and LFOs for this layer. */
	public stop(): void {
		this.allNodesToStart.forEach((node) => node.stop(0));
	}
}
