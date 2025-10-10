
import AudioManager from "./AudioManager";
import { SoundLayer } from "./SoundLayer";


// Type Definitions ------------------------------------------------------------------


export interface LFOConfig {
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'perlin';
	rate: number;
	depth: number;
}

export interface ModulatedParamConfig {
	base: number;
	lfo?: LFOConfig;
}

export interface NoiseSourceConfig {
	type: 'noise';
}

export interface OscillatorSourceConfig {
	type: 'oscillator';
	wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
	freq: ModulatedParamConfig;
	detune: ModulatedParamConfig;
}

export type SourceConfig = NoiseSourceConfig | OscillatorSourceConfig;

export interface FilterConfig {
	type: BiquadFilterType;
	frequency: ModulatedParamConfig;
	Q: ModulatedParamConfig;
	gain: ModulatedParamConfig;
}

export interface LayerConfig {
	volume: ModulatedParamConfig;
	source: SourceConfig;
	filters: FilterConfig[];
}

export interface SoundscapeConfig {
	masterVolume: number;
	layers: LayerConfig[];
}


// Fading Constants and Utility --------------------------------------------------------------------------------


/** The number of points to use when generating fade curves. Higher = smoother, but more CPU. */
const FADE_CURVE_RESOLUTION = 100;

/**
 * Higher = Exponential ramp gets more weight at beginning, Linear ramp gets more weight at end.
 * Range:
 * 	   0.0 (perfect 50% blend of linear and exponential throughout time t)
 *     to 0.5 (100% exponential ramp at start, 100% linear ramp at end)
 */
const FADE_RAMP_CURVATURE = 0.4;


/**
 * Applies a perceptually-blended fade with a dynamic blending curve.
 * This can be tuned between linear and exponential ramps
 * providing a more natural-sounding fade.
 * @param audioContext The active AudioContext.
 * @param gainParam The gain AudioParam to be modified.
 * @param targetVolume The final volume (amplitude) for the fade.
 * @param durationMillis The duration of the fade in milliseconds.
 * @param blendRatio A function that returns the blend ratio (0.0 to 1.0) for a given normalized time t (0.0 to 1.0). Higher = more exponential. Lower = more linear.
 * @param isFadeOut Whether this is a fade-out (true) or fade-in (false).
 */
function applyPerceptualFade(audioContext: AudioContext, gainParam: AudioParam, targetVolume: number, durationMillis: number): void {
	const now: number = audioContext.currentTime;
	const startVolume: number = gainParam.value;

	gainParam.cancelScheduledValues(now);
	gainParam.setValueAtTime(startVolume, now);

	const curve: Float32Array = new Float32Array(FADE_CURVE_RESOLUTION);
	const MIN_GAIN = 0.00001; 
	const effectiveStart = Math.max(startVolume, MIN_GAIN);
	const effectiveTarget = Math.max(targetVolume, MIN_GAIN);

	const easeFunction = (t: number): number => FADE_RAMP_CURVATURE * Math.sin(Math.PI * t + 0.5 * Math.PI) + 0.5;

	for (let i = 0; i < FADE_CURVE_RESOLUTION; i++) {
		const progress: number = i / (FADE_CURVE_RESOLUTION - 1); // Our 't' from 0.0 to 1.0
		const isFadeOut = targetVolume < startVolume;
		const blendProgress = isFadeOut ? 1 - progress : progress; // Reverse for fade-out
		const currentRatio = easeFunction(blendProgress);

		// Calculate what the points would be for pure linear and pure exponential ramps.
		const linearPoint = startVolume + (targetVolume - startVolume) * progress;
		const exponentialPoint = effectiveStart * Math.pow(effectiveTarget / effectiveStart, progress);

		// Blend the two points using the ratio.
		curve[i] = linearPoint * (1 - currentRatio) + exponentialPoint * currentRatio;
	}
	
	curve[FADE_CURVE_RESOLUTION - 1] = targetVolume;
	gainParam.setValueCurveAtTime(curve, now, durationMillis / 1000);
}


// The Main Player Class --------------------------------------------------------------------------------

export class SoundscapePlayer {
	private readonly config: SoundscapeConfig;

	private audioContext: AudioContext;
	private masterGain: GainNode;
	private layers: SoundLayer[] = [];
	// private masterVolume: number;
	
	// private sharedNoiseBuffer: AudioBuffer;
	private sharedNoiseSource: AudioBufferSourceNode | null = null;
	/** A promise that resolves when the audio graph is built and ready for playback. */
	private playerReadyPromise: Promise<void> | null = null;
	/** A flag to handle race conditions where a fadeOut is called before a fadeIn has completed initialization. */
	private isStopPending: boolean = false;
	// private isPlaying = false;

	constructor(config: SoundscapeConfig) {
		this.config = config;
		this.audioContext = AudioManager.getContext();
		this.masterGain = this.audioContext.createGain();
	}

	/**
	 * Initializes the audio graph, creates all nodes, and starts sources. This is called only once.
	 * This is the expensive part of the process.
	 */
	private initializeAndPlay(): void {
		this.masterGain.gain.value = 0.0; // Always start silent
		this.masterGain.connect(this.audioContext.destination);

		// Create the shared raw noise buffer data
		const noiseDurationSecs = 10;
		const bufferSize = noiseDurationSecs * this.audioContext.sampleRate;
		const sharedNoiseBuffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
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
		// this.isPlaying = true;
	}

	/**
	 * Gets the player's initialized state, creating the audio graph if it doesn't exist yet.
	 * This ensures the expensive initialization only ever happens once.
	 */
	private ensureReady(): Promise<void> {
		if (!this.playerReadyPromise) {
			this.playerReadyPromise = new Promise(resolve => {
				this.initializeAndPlay();
				resolve();
			});
		}
		return this.playerReadyPromise;
	}

	// private createSharedNoiseSource(): void {
	// 	this.sharedNoiseSource = this.audioContext.createBufferSource();
	// 	this.sharedNoiseSource.buffer = this.sharedNoiseBuffer;
	// 	this.sharedNoiseSource.loop = true;
	// }

	/** Starts the soundscape. It will be silent until fadeIn is called. */
	// public play(): void {
	// 	if (this.isPlaying) return;
	// 	this.isPlaying = true;
		
	// 	this.sharedNoiseSource!.start(0);
	// 	this.layers.forEach(layer => layer.start());
	// }
	

	/**
	 * Immediately stops all audio, disconnects nodes, and resets the player to a clean state.
     * The player can be started again with fadeIn().
     */
	public async stop(): Promise<void> {
		this.isStopPending = true;
		if (!this.playerReadyPromise) return; // Not even initialized, nothing to do.

		await this.ensureReady(); // Make sure everything is created before we try to destroy it.

        this.sharedNoiseSource!.stop(0);
        this.layers.forEach(layer => layer.stop());

        // Disconnect everything to be garbage collected
        this.masterGain?.disconnect();
        this.sharedNoiseSource?.disconnect();
        
        // Reset state
        // this.isPlaying = false;
        this.playerReadyPromise = null; // Allow re-initialization on next fadeIn
        this.layers = [];
	}

	/** Fades in the ambience to a specified target volume. */
	public async fadeIn(targetVolume: number, durationMillis: number): Promise<void> {
		this.isStopPending = false; // Clear any pending fade-out/stop request.

		// Await initialization. This is a no-op if already initialized.
		await this.ensureReady();

		// If a stop was requested while we were awaiting initialization, bail out.
		if (this.isStopPending) return;
		
		applyPerceptualFade(this.audioContext!, this.masterGain!.gain, targetVolume, durationMillis);
	}

	/** Fades out the ambience to silence. The player remains active at zero volume. */
	public async fadeOut(durationMillis: number): Promise<void> {
		this.isStopPending = true; // Signal that a stop is in progress.

		// If the player hasn't even started initializing, there's nothing to fade out.
		if (!this.playerReadyPromise) return;

		// Await initialization to ensure we have a graph to fade out.
		await this.ensureReady();
		
		applyPerceptualFade(this.audioContext!, this.masterGain!.gain, 0.0, durationMillis);
	}
}