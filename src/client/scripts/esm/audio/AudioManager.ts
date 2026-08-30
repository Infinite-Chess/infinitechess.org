// src/client/scripts/esm/audio/AudioManager.ts

/**
 * This module is responsible for creating and playing sounds using the Web Audio API.
 */

import AudioUtils from './AudioUtils';
import preferences from '../util/preferences';
import { SettingsBus } from '../util/SettingsBus';
import { DownsamplerNode } from './processors/downsampler/DownsamplerNode';
import { createEffectNode, EffectConfig, NodeChain } from './AudioEffects';

// Types -----------------------------------------------------------------------

/**
 * A one-shot sound in flight. Long-running, loopable, fadeable
 * audio is the SoundscapePlayer's job, not this module's.
 */
export interface SoundObject {
	/**
	 * Resolves once the note AND its effect tails (e.g. reverb) have fully finished —
	 * await before anything that would cut the sound off (e.g. a hard navigation).
	 */
	whenEnded: Promise<void>;
}

/** Config options for playing a sound. */
interface PlaySoundOptions {
	/** Volume of the sound. Default: 1. Typical range: 0-1. Capped at {@link VOLUME_DANGER_THRESHOLD} for safety. */
	volume?: number;
	/** Delay before the sound starts playing in seconds. Default: 0 */
	delay?: number;
	/** An array of effects to apply to the sound. */
	effects?: EffectConfig[];
	/**
	 * Playback rate of the sound. Default: 1. 1 = normal speed & pitch
	 * Lower = slower & lower pitch. Higher = faster & higher pitch.
	 */
	playbackRate?: number;
	/** If true, the sound will bypass the global downsampler effect. Default: false */
	bypassDownsampler?: boolean;
}

// Constants -------------------------------------------------------------------

/** Any volume above this is probably a mistake, so we reset it to 1 and log an error in the console. */
const VOLUME_DANGER_THRESHOLD = 4;

// State -----------------------------------------------------------------------

/** This context plays all our sounds. */
const audioContext: AudioContext = new AudioContext();

/** An input bus for all sound chains before they reach the master gain. Allows for global effects. */
const effectsBus = audioContext.createGain();
/** The global downsampler effect node. Null until the worklet is loaded. */
let globalDownsampler: DownsamplerNode | null = null;
/** The gain node for the "dry" (unprocessed) signal path around the downsampler. */
const downsamplerDryGain = audioContext.createGain();
downsamplerDryGain.gain.value = 1; // Default to 100% dry signal
/** The gain node for the "wet" (processed) signal path through the downsampler. */
const downsamplerWetGain = audioContext.createGain();
downsamplerWetGain.gain.value = 0; // Default to 0% wet signal

/** A master gain node to control the overall volume of all sounds. */
const masterGain = audioContext.createGain();
masterGain.gain.value = preferences.getMasterVolume(); // Initialize to saved preference
// Listen for changes to the master volume preference
SettingsBus.addEventListener('master-volume-change', (event) => {
	const newVolume = event.detail;
	masterGain.gain.setValueAtTime(newVolume, audioContext.currentTime);
});

/** A final safety compressor to prevent clipping from very high gain. */
const limiter = new DynamicsCompressorNode(audioContext, {
	threshold: -0.1, // Start compressing just before the signal hits 0dB
	knee: 0, // Hard knee for a strict ceiling
	ratio: 20, // A 20:1 ratio is considered "limiting"
	attack: 0.001, // Very fast attack to catch transients
	release: 0.1, // Quick release
});

// Initialization --------------------------------------------------------------

// Connect the audio graph: Effects Bus -> Master Gain -> Limiter -> Destination (speakers)
// Initially, connect the effectsBus directly to masterGain as a bypass until the downsampler loads.
effectsBus.connect(masterGain);
masterGain.connect(limiter);
limiter.connect(audioContext.destination);

// Asynchronously load and initialize the Downsampler worklet.
(async () => {
	try {
		const downsamplerNode = await DownsamplerNode.create(audioContext);
		globalDownsampler = downsamplerNode;

		// Set the static parameters for the downsampler effect
		globalDownsampler.downsampling!.value = 20; // Default: 20

		// Re-wire the audio graph to include the dry/wet downsampler paths
		effectsBus.disconnect(masterGain); // Disconnect the bypass

		// Dry path
		effectsBus.connect(downsamplerDryGain);
		downsamplerDryGain.connect(masterGain);

		// Wet path
		effectsBus.connect(globalDownsampler);
		globalDownsampler.connect(downsamplerWetGain);
		downsamplerWetGain.connect(masterGain);
	} catch (error) {
		console.error('Failed to initialize global downsampler effect. Audio will remain clean.', error); // prettier-ignore
		// If it fails, the initial bypass connection from effectsBus to masterGain remains active.
	}
})();

// Getters ---------------------------------------------------------------------

/** Returns the global audio context. */
function getContext(): AudioContext {
	return audioContext;
}

/**
 * Returns the master gain node. All sounds MUST route through the
 * master gain node in order for the master volume control to work!
 * This should be used for sounds that need to BYPASS the global effects bus (such as ambiences).
 */
function getDestination(): AudioNode {
	return masterGain;
}

// Public API ------------------------------------------------------------------

/** Fades in the global downsampler effect over a given duration. */
function fadeInDownsampler(durationMillis: number): void {
	if (!globalDownsampler) {
		console.warn('Downsampler not loaded yet, cannot fade in.');
		return;
	}
	AudioUtils.applyPerceptualFade(audioContext, downsamplerDryGain.gain, 0, durationMillis);
	AudioUtils.applyPerceptualFade(audioContext, downsamplerWetGain.gain, 1, durationMillis);
}

/** Fades out the global downsampler effect over a given duration. */
function fadeOutDownsampler(durationMillis: number): void {
	if (!globalDownsampler) {
		console.warn('Downsampler not loaded yet, cannot fade out.');
		return;
	}
	AudioUtils.applyPerceptualFade(audioContext, downsamplerDryGain.gain, 1, durationMillis);
	AudioUtils.applyPerceptualFade(audioContext, downsamplerWetGain.gain, 0, durationMillis);
}

// Sound Playing ---------------------------------------------------------------

/** Plays the specified audio buffer with the specified options. */
function playAudio(buffer: AudioBuffer, playOptions: PlaySoundOptions): SoundObject {
	// Attempt to resume if it was suspended (e.g., due to browser autoplay policy)
	if (audioContext.state === 'suspended') audioContext.resume();

	const {
		volume = 1,
		delay = 0,
		playbackRate = 1,
		effects = [],
		bypassDownsampler = false,
	} = playOptions;

	// Calculate the desired start time by adding the delay
	const startAt = audioContext.currentTime + delay;

	// We need an audio "source" to play our main sound effect. Several of these can exist at once for one audio context.

	// 1. Create the fundamental source and its master gain node.
	const { source, gainNode } = createBufferSource(buffer, volume, playbackRate);

	// 2. Build the effects chain by asking the factory to create the nodes.
	const effectNodes = effects.map((effectConfig) => createEffectNode(audioContext, effectConfig));

	// 3. Connect the nodes in order: Source -> Gain -> Effect1 -> Effect2 -> Effects Bus -> Master Gain -> Limiter -> Destination
	connectNodeChain(gainNode, effectNodes, bypassDownsampler);

	// Resolved by scheduleDisconnection once the sound + tails finish.
	let resolveWhenEnded!: () => void;
	const whenEnded = new Promise<void>((resolve) => (resolveWhenEnded = resolve));

	// Start the playback
	source.start(startAt);

	scheduleDisconnection(source, effects, resolveWhenEnded);

	return { whenEnded };
}

/**
 * Schedules disconnection of the audio nodes after the sound and its effects have finished playing.
 *
 * Patches a bug on chrome, where when audio sources are played
 * that have a reverb (or any other tail) effect, the audio nodes
 * are garbage collected too early, cutting off the tail effect.
 */
function scheduleDisconnection(
	source: AudioBufferSourceNode,
	effects: EffectConfig[],
	onEnded: () => void,
): void {
	// Anchored to 'ended', which fires on the AUDIO clock, so it stays correct however
	// late a suspended context actually begins rendering. Timing the whole lifetime off
	// setTimeout instead would disconnect mid-note whenever the context started late,
	// cutting the sound off (or silencing it outright, for sounds shorter than the delay).
	source.addEventListener('ended', () => {
		// 'ended' marks the end of the BUFFER, so any effect tails are still sounding.
		// Find the longest tail duration among all applied effects.
		const maxTailSecs = effects.reduce((max, effect) => {
			if (effect.type === 'reverb') return Math.max(max, effect.durationSecs);
			// Future effects with tails (e.g., delay) could be accounted for here.
			else throw Error(`Sound effect type "${effect.type}" not accounted for in tail duration calculation.`); // prettier-ignore
		}, 0);

		// Safe as wall-clock: the audio clock can only ever lag behind it, never lead,
		// so this can fire late (harmless — disconnection only frees the nodes) but never early.
		// Holds a reference to the source, and through it the whole chain, until the tails finish.
		setTimeout(() => {
			source.disconnect();
			onEnded();
		}, maxTailSecs * 1000);
	});
}

// Audio Nodes -----------------------------------------------------------------

/**
 * Creates a new buffer source and its master gain node.
 * It does NOT connect it to the destination, allowing an effects chain to be inserted later.
 * @param buffer - The audio buffer to play.
 * @param volume - The initial volume of the sound (0-1).
 * @param playbackRate - The playback rate of the sound. 1 = normal speed & pitch.
 * @returns The source and the gain node it feeds, which is where fading controls act.
 */
function createBufferSource(
	buffer: AudioBuffer,
	volume: number,
	playbackRate: number = 1,
): { source: AudioBufferSourceNode; gainNode: GainNode } {
	const source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = playbackRate;

	const gainNode = generateGainNode(audioContext, volume);
	source.connect(gainNode); // Connect source to its own master gain node

	return { source, gainNode };
}

/** Generates a gain node for affecting the volume of sounds. */
function generateGainNode(audioContext: AudioContext, volume: number): GainNode {
	if (volume > VOLUME_DANGER_THRESHOLD) {
		console.error(`Gain was DANGEROUSLY set to ${volume}!!!! Resetting to 1.`);
		volume = 1;
	}
	const gainNode = audioContext.createGain();
	gainNode.gain.value = volume; // Set the volume level (0 to 1)
	return gainNode;
}

/**
 * Connects a starting node through a list of effect wrappers, ending at
 * either the global effects bus or directly at the master gain.
 * @param startNode - The first node in the chain (usually a source's gain node).
 * @param wrapperList - The list of effects to connect in series.
 * @param bypassDownsampler - If true, the chain will connect to masterGain, otherwise effectsBus.
 */
function connectNodeChain(
	startNode: AudioNode,
	wrapperList: NodeChain[],
	bypassDownsampler: boolean,
): void {
	let currentNode: AudioNode = startNode;

	for (const effectWrapper of wrapperList) {
		currentNode.connect(effectWrapper.input);
		currentNode = effectWrapper.output; // The output of this effect is the input to the next one.
	}

	// Connect the very last node in the chain to either the effects bus or directly to master gain.
	const destinationNode = bypassDownsampler ? masterGain : effectsBus;
	currentNode.connect(destinationNode);
}

// Exports ---------------------------------------------------------------------

export default {
	// Getters
	getContext,
	getDestination,
	// Public API
	fadeInDownsampler,
	fadeOutDownsampler,
	// Sound Playing
	playAudio,
};
