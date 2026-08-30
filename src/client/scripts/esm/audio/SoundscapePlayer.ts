// src/client/scripts/esm/audio/SoundscapePlayer.ts

/**
 * This module implements a soundscape player that can play complex, layered ambient sounds.
 *
 * For creating of soundscape configs, use the Interactive Soundscape Generator tool:
 * dev-utils/sounds/SoundscapeGenerator.html
 */

import AudioUtils from './AudioUtils';
import AudioManager from './AudioManager';
import { LayerConfig, SoundLayer } from './SoundLayer';

// Types -----------------------------------------------------------------------

/** The complete configuration for a soundscape. */
export interface SoundscapeConfig {
	masterVolume: number;
	layers: LayerConfig[];
}

// Constants -------------------------------------------------------------------

/**
 * The length of the shared noise buffer for this soundscape's layers, in seconds.
 * Longer = less repetition, but more memory use and cpu initialization time.
 */
const NOISE_DURATION_SECS = 10;

// SoundscapePlayer Class ------------------------------------------------------

/** The control interface for a soundscape player. */
export class SoundscapePlayer {
	private readonly config: SoundscapeConfig;

	private readonly audioContext: AudioContext;
	/** The master gain node controlling overall volume of the soundscape. */
	private readonly masterGain: GainNode;
	/** All the individual sound layers in this soundscape. */
	private layers: SoundLayer[] = [];

	/**
	 * A shared noise source for all layers to use. Reduces CPU and memory usage.
	 * Null until expensive initialization is performed lazilly.
	 */
	private sharedNoiseSource: AudioBufferSourceNode | null = null;

	constructor(config: SoundscapeConfig) {
		this.config = config;
		this.audioContext = AudioManager.getContext();
		this.masterGain = this.audioContext.createGain();
	}

	/** Builds the audio graph, creates all nodes, and starts every source at volume 0. */
	private initializeAndPlay(): void {
		this.masterGain.gain.value = 0.0; // Always start silent
		this.masterGain.connect(AudioManager.getDestination()); // Connect to the global master gain

		const sharedNoiseSource = this.createSharedNoiseSource();

		// Build each layer
		this.config.layers.forEach((layerConfig) => {
			const layer = new SoundLayer(this.audioContext, layerConfig, sharedNoiseSource);
			layer.connect(this.masterGain);
			this.layers.push(layer);
		});

		// Start all sources (at volume 0)
		sharedNoiseSource.start(0);
		this.layers.forEach((layer) => layer.start());

		// Stored last, since a non-null source is what marks the player initialized.
		this.sharedNoiseSource = sharedNoiseSource;
	}

	/** Creates the looping stereo noise source that every noise layer draws from. */
	private createSharedNoiseSource(): AudioBufferSourceNode {
		const bufferSize = NOISE_DURATION_SECS * this.audioContext.sampleRate;
		// 2 channels for stereo sound (unique noise in each ear)
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		for (let c = 0; c < 2; c++) {
			const channelData = buffer.getChannelData(c);
			for (let i = 0; i < bufferSize; i++) {
				channelData[i] = Math.random() * 2 - 1;
			}
		}

		const source = this.audioContext.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		return source;
	}

	/**
	 * Immediately stops all audio, disconnects nodes, and resets the player to a clean state.
	 * The player can be started again with fadeIn().
	 */
	public stop(): void {
		if (!this.sharedNoiseSource) return; // Not even initialized, nothing to do.

		this.sharedNoiseSource.stop(0);
		this.layers.forEach((layer) => layer.stop());

		// Disconnect everything to be garbage collected
		this.masterGain.disconnect();
		this.sharedNoiseSource.disconnect();

		// Reset state. Nulling the source is what allows re-initialization on the next fadeIn().
		this.sharedNoiseSource = null;
		this.layers = [];
	}

	/** Fades in the soundscape to a specified target volume, initializing it if necessary. */
	public fadeIn(durationMillis: number): void {
		if (!this.sharedNoiseSource) this.initializeAndPlay();

		AudioUtils.applyPerceptualFade(
			this.audioContext,
			this.masterGain.gain,
			this.config.masterVolume,
			durationMillis,
		);
	}

	/** Fades out the ambience to silence. The player remains active at zero volume. */
	public fadeOut(durationMillis: number): void {
		if (!this.sharedNoiseSource) return; // Hasn't initialized, nothing to fade out.

		AudioUtils.applyPerceptualFade(
			this.audioContext,
			this.masterGain.gain,
			0.0,
			durationMillis,
		);
	}
}
