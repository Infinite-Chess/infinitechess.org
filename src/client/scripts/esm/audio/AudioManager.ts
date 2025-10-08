
// src/client/scripts/esm/audio/AudioManager.ts

/**
 * This module is responsible for creating and playing sounds using the Web Audio API.
 */

import { createEffectNode, EffectConfig, NodeChain } from "./AudioEffects";

// Type Definitions ----------------------------------------------------------------------------------


type AudioBufferWithGainNode = AudioBufferSourceNode & { gainNode: GainNode }

interface SoundObject {
	/** The source of the audio, with its attached `gainNode`. */
	source: AudioBufferWithGainNode,
	/** Whether to loop the sound indefinitely. */
	readonly looping: boolean,
	/**
	 * Stops the sound from playing.
	 * If this creates static pops, use fadeOut() instead.
	 */
	stop: () => void
	/**
	 * Fades out the sound.
	 * [Looping sounds] Fades to silent and continues playing.
	 * [Non-looping sounds] Fades to silent and then stops the sound entirely.
	 * @param durationMillis - The duration of the fade out in milliseconds.
	 */
	// eslint-disable-next-line no-unused-vars
	fadeOut: (durationMillis: number) => void
	/**
	 * Fades in the sound from its current volume to a target volume.
	 * If you wish to fade-in a non-looping sound, initate the sound object with 0 volume initially.
	 * @param targetVolume - The final volume level (0-1).
	 * @param durationMillis - The duration of the fade-in effect in milliseconds.
	 */
	// eslint-disable-next-line no-unused-vars
	fadeIn: (targetVolume: number, durationMillis: number) => void
}


/** Config options for playing a sound. */
interface PlaySoundOptions {
	/** The time of the audio buffer to start playing, if not from the beginning. */
	startTime?: number,
	/** The duration to play the audio buffer for, if not for the whole duration. */
	duration?: number,
	/** Volume of the sound. Default: 1. Typical range: 0-1. Capped at {@link VOLUME_DANGER_THRESHOLD} for safety. */
	volume?: number,
	/** Delay before the sound starts playing in seconds. Default: 0 */
	delay?: number,
	/** An array of effects to apply to the sound. */
	effects?: EffectConfig[],
	/**
	 * Playback rate of the sound. Default: 1. 1 = normal speed & pitch
	 * Lower = slower & lower pitch. Higher = faster & higher pitch.
	 */
	playbackRate?: number
	/** Whether the sound should loop indefinitely. Default: false */
	loop?: boolean,
}


// Constants ----------------------------------------------------------------------------------------------


/** Any volume above this is probably a mistake, so we reset it to 1 and log an error in the console. */
const VOLUME_DANGER_THRESHOLD = 4;


// State ----------------------------------------------------------------------------------------------


/** This context plays all our sounds. */
const audioContext: AudioContext = new AudioContext();

/**
 * Whether the user has interacted with the page at least once.
 * 
 * This is used to determine if we can play audio, as some browsers
 * block audio playback until the user has interacted with the page.
 */
let atleastOneUserGesture = false;

// We listen for the first user gesture to unlock audio playback.
document.addEventListener('mousedown', callback_OnUserGesture);
document.addEventListener('click', callback_OnUserGesture);
function callback_OnUserGesture(): void {
	atleastOneUserGesture = true;
	audioContext.resume();
	console.log("Resuming audio context after user gesture.");
	document.removeEventListener('mousedown', callback_OnUserGesture);
	document.removeEventListener('click', callback_OnUserGesture);
}


// Initialization ----------------------------------------------------------------------------------


/** Decodes audio data from an ArrayBuffer from a fetch request into an AudioBuffer. */
function decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
	return new Promise((resolve, reject) => {
		if (!audioContext) {
			reject("Audio context not initialized.");
			return;
		}
		audioContext.decodeAudioData(buffer, (decodedData) => resolve(decodedData), (error) => reject(error));
	});
}


// Sound Playing ------------------------------------------------------------------------------------------


/** Plays the specified audio buffer with the specified options. */
function playAudio(buffer: AudioBuffer | undefined, playOptions: PlaySoundOptions): SoundObject | undefined {
	if (!atleastOneUserGesture) return; // Skip playing this sound (browsers won't allow it if we try, not until the user first interacts with the page)
	if (!audioContext) {
		console.warn(`Can't play sound when audioContext isn't initialized yet. (Still loading)`);
		return;
	}
	if (!buffer) {
		console.warn(`Can't play sound when buffer isn't loaded yet. (Still loading)`);
		return;
	}

	const { startTime, duration, volume = 1, delay = 0, playbackRate = 1, loop = false, effects = [] } = playOptions;

	// Calculate the desired start time by adding the delay
	const startAt = audioContext.currentTime + delay;

	// We need an audio "source" to play our main sound effect. Several of these can exist at once for one audio context.

	// 1. Create the fundamental source and its master gain node.
	const mainSource = createBufferSource(buffer, volume, playbackRate);
	mainSource.loop = loop; // Set the loop property on the audio source itself.

	// 2. Build the effects chain by asking the factory to create the nodes.
	const effectNodes = effects.map(effectConfig => createEffectNode(audioContext, effectConfig));

	// 3. Connect the nodes in order: Source -> Gain -> Effect1 -> Effect2 -> Destination
	const masterGainNode = mainSource.gainNode;
	connectNodeChain(masterGainNode, audioContext, effectNodes);

	// The SoundObject is now much simpler!
	const soundObject: SoundObject = {
		source: mainSource,
		looping: loop,

		stop: (): void => {
			soundObject.source.stop();
		},
		fadeOut: (durationMillis): void => {
			const fadeOutDurationSecs = durationMillis / 1000;
			const fadeOutEndTime = audioContext.currentTime + fadeOutDurationSecs;
			// Fade the source to silent
			fadeOut(soundObject.source, fadeOutEndTime);
			// For non-looping sounds, schedule them to stop completely after the fade.
			if (!soundObject.looping) setTimeout(() => soundObject.stop(), durationMillis);
		},
		fadeIn: (targetVolume, durationMillis): void => {
			const fadeInDurationSecs = durationMillis / 1000;
			const fadeInEndTime = audioContext.currentTime + fadeInDurationSecs;
			// Fade the main source to the target volume
			fadeIn(soundObject.source, targetVolume, fadeInEndTime);
		}
	};

	// Start the playback
	soundObject.source.start(startAt, startTime, duration);
	
	scheduleDisconnection(mainSource, buffer, loop, delay, effects, duration, startTime);
	
	return soundObject;
}

/**
 * Schedules disconnection of the audio nodes after the sound and its effects have finished playing.
 * 
 * Patches a bug on chrome, where when audio sources are played
 * that have a reverb (or any other tail) effect, the audio nodes
 * are garbage collected too early, cutting off the tail effect.
 */
function scheduleDisconnection(source: AudioBufferSourceNode, buffer: AudioBuffer, loop: boolean, delay: number, effects: EffectConfig[], duration?: number, startTime?: number): void {
	if (loop) return;

	const sourceDurationSecs = duration ?? (buffer.duration - (startTime ?? 0));
	
	// Find the longest tail duration among all applied effects.
	const maxTailSecs = effects.reduce((max, effect) => {
		if (effect.type === 'reverb') return Math.max(max, effect.durationSecs);
		// Future effects with tails (e.g., delay) could be accounted for here.
		else throw Error(`Sound effect type "${effect.type}" not accounted for in tail duration calculation.`);
	}, 0);

	const totalLifetimeMillis = (sourceDurationSecs + maxTailSecs + delay) * 1000;

	// Keep a reference to the source for the entire lifetime of the sound + effects.
	setTimeout(() => { source.disconnect(); }, totalLifetimeMillis);
}


// Audio Nodes ------------------------------------------------------------------------------------------


/**
 * Creates a new buffer source and its master gain node.
 * It does NOT connect it to the destination, allowing an effects chain to be inserted later.
 * @param buffer - The audio buffer to play.
 * @param volume - The initial volume of the sound (0-1).
 * @param playbackRate - The playback rate of the sound. 1 = normal speed & pitch.
 * @returns The created AudioBufferSourceNode with its attached GainNode as `gainNode` property.
 */
function createBufferSource(buffer: AudioBuffer, volume: number, playbackRate: number = 1): AudioBufferWithGainNode {
	const source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = playbackRate;

	const gainNode = generateGainNode(audioContext, volume);
	source.connect(gainNode); // Connect source to its own master gain node

	// @ts-ignore
	source.gainNode = gainNode; // Attach for fading controls

	return source as AudioBufferWithGainNode;
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
 * Connects a starting node through a list of effect wrappers, ending at the destination.
 * This logic is now clean and simple because every effect has a uniform shape.
 */
function connectNodeChain(startNode: AudioNode, context: AudioContext, wrapperList: NodeChain[]): void {
	let currentNode: AudioNode = startNode;

	for (const effectWrapper of wrapperList) {
		currentNode.connect(effectWrapper.input);
		currentNode = effectWrapper.output; // The output of this effect is the input to the next one.
	}

	// Connect the very last node in the chain to the destination (speakers).
	currentNode.connect(context.destination);
}

/**
 * Initiates a fade-in for an audio source's gain node. This is interruptible.
 * @param source - The audio source node to fade in, WITH ITS `gainNode` property attached.
 * @param targetVolume - The final volume level.
 * @param endTime - The audioContext time at which the fade should complete.
 */
function fadeIn(source: AudioBufferWithGainNode, targetVolume: number, endTime: number): void {
	const now = audioContext.currentTime;
	// First, cancel any pending volume changes to make this interruptible.
	source.gainNode.gain.cancelScheduledValues(now);
	// Set the starting point for the ramp at the current volume.
	source.gainNode.gain.setValueAtTime(source.gainNode.gain.value, now);
	// Schedule the linear ramp to the target volume.
	source.gainNode.gain.linearRampToValueAtTime(targetVolume, endTime);
}

/**
 * Initiates a fade-out for an audio source's gain node. This is interruptible.
 * @param source - The audio source node to fade out, WITH ITS `gainNode` property attached.
 * @param endTime - The audioContext time at which the fade should complete.
 */
function fadeOut(source: AudioBufferWithGainNode, endTime: number): void {
	const now = audioContext.currentTime;
	// First, cancel any pending volume changes to make this interruptible.
	source.gainNode.gain.cancelScheduledValues(now);
	// Set the starting point for the ramp at the current volume.
	source.gainNode.gain.setValueAtTime(source.gainNode.gain.value, now);
	// Schedule the linear ramp down to zero.
	source.gainNode.gain.linearRampToValueAtTime(0, endTime);
}


// Exports ----------------------------------------------------------------------


export type {
	SoundObject,
};

export default {
	decodeAudioData,
	playAudio,
};