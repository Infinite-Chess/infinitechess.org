
// src/client/scripts/esm/audio/SoundscapePlayer.ts

/**
 * This module implements a soundscape player that can play complex, layered ambient sounds.
 */


import AudioManager from "./AudioManager";
import AudioUtils from "./AudioUtils";
import { LayerConfig, SoundLayer } from "./SoundLayer";


// Type Definitions ------------------------------------------------------------------


/** The complete configuration for a soundscape. */
export interface SoundscapeConfig {
	masterVolume: number;
	layers: LayerConfig[];
}


// Constants  --------------------------------------------------------------------------------


/**
 * The length of the shared noise buffer for this soundscape's layers, in seconds.
 * Longer = less repetition, but more memory use and cpu initialization time.
 */
const NOISE_DURATION_SECS = 10;


// SoundscapePlayer Class --------------------------------------------------------------------------------


/** The control interface for a soundscape player. */
export class SoundscapePlayer {
	private readonly config: SoundscapeConfig;

	private audioContext: AudioContext;
	/** The master gain node controlling overall volume of the soundscape. */
	private masterGain: GainNode;
	/** All the individual sound layers in this soundscape. */
	private layers: SoundLayer[] = [];
	
	/** A shared noise source for all layers to use. Reduces CPU and memory usage. */
	private sharedNoiseSource: AudioBufferSourceNode | null = null;

	/**
	 * Whether the player has been initialized and is ready to play. 
	 * We only initialize when playing is actually needed, as it's expensive.
	 */
	private playerReady: boolean = false;


	constructor(config: SoundscapeConfig) {
		this.config = config;
		this.audioContext = AudioManager.getContext();
		this.masterGain = this.audioContext.createGain();
	}


	/**
	 * Initializes the audio graph, creates all nodes, and starts sources.
	 * This is called only once. This is the expensive part of the process.
	 */
	private initializeAndPlay(): void {
		this.masterGain.gain.value = 0.0; // Always start silent
		this.masterGain.connect(this.audioContext.destination);

		// Create the shared raw noise buffer data source
		const bufferSize = NOISE_DURATION_SECS * this.audioContext.sampleRate;
		const sharedNoiseBuffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate); // 2 channels for stereo sound (unique noise in each ear)
		for (let c = 0; c < 2; c++) {
			const channelData = sharedNoiseBuffer.getChannelData(c);
			for (let i = 0; i < bufferSize; i++) {
				channelData[i] = Math.random() * 2 - 1;
			}
		}
		this.sharedNoiseSource = this.audioContext.createBufferSource();
		this.sharedNoiseSource.buffer = sharedNoiseBuffer;
		this.sharedNoiseSource.loop = true;

		// Build each layer
		this.config.layers.forEach(layerConfig => {
			const layer = new SoundLayer(this.audioContext!, layerConfig, this.sharedNoiseSource!);
			layer.connect(this.masterGain!);
			this.layers.push(layer);
		});

		// Start all sources (at volume 0)
		this.sharedNoiseSource.start(0);
		this.layers.forEach(layer => layer.start());

		this.playerReady = true;
	}

	/**
	 * Immediately stops all audio, disconnects nodes, and resets the player to a clean state.
     * The player can be started again with fadeIn().
     */
	public stop(): void {
		if (!this.playerReady) return; // Not even initialized, nothing to do.

        this.sharedNoiseSource!.stop(0);
        this.layers.forEach(layer => layer.stop());

        // Disconnect everything to be garbage collected
        this.masterGain.disconnect();
        this.sharedNoiseSource?.disconnect();
        
        // Reset state
        this.playerReady = false; // Allow re-initialization on next fadeIn
        this.layers = [];
	}


	/** Fades in the soundscape to a specified target volume, initializing it if necessary. */
	public fadeIn(durationMillis: number): void {
		// Initialize now if not already done.
		// Saves compute until the soundscape is actually NEEDED,
		// as the initialization is expensive.
		if (!this.playerReady) this.initializeAndPlay();
		
		AudioUtils.applyPerceptualFade(this.audioContext, this.masterGain.gain, this.config.masterVolume, durationMillis);
	}

	/** Fades out the ambience to silence. The player remains active at zero volume. */
	public fadeOut(durationMillis: number): void {
		if (!this.playerReady) return; // Hasn't initialized, nothing to fade out.
		
		AudioUtils.applyPerceptualFade(this.audioContext, this.masterGain.gain, 0.0, durationMillis);
	}
}