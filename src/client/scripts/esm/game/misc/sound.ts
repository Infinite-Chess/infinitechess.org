
// src/client/scripts/esm/game/misc/sound.ts

/**
 * This script controls the playing of our sound effects
 * from inside the sound spritesheet.
 */


// Type Definitions ----------------------------------------------------------------------------------


type AudioBufferWithGainNode = AudioBufferSourceNode & { gainNode: GainNode }

interface SoundObject {
	/** The source of the audio, with its attached `gainNode`. */
	source: AudioBufferWithGainNode,
	/** The source of the reverb-only part of the audio, if specified, with its attached `gainNode`. */
	sourceReverb?: AudioBufferWithGainNode,
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

	/** Whether to loop the sound indefinitely. */
	readonly looping: boolean,
	/** The ratio of the main volume at which the reverb should play. */
	readonly _reverbRatio: number, // CHANGED
}

type SoundTimeSnippet = readonly [number, number];


/** Config options for playing a sound. */
interface PlaySoundOptions {
	/** Volume of the sound. Default: 1. Typical range: 0-1. Capped at {@link VOLUME_DANGER_THRESHOLD} for safety. */
	volume?: number,
	/** Delay before the sound starts playing in seconds. Default: 0 */
	delay?: number,
	/** Offset into the start of the sound effect in milliseconds. The higher this is, the more chopped off the beginning is. Default: 0 (no offset) */
	offset?: number,
	/** A ratio of the main volume for an optional reverb effect. Default: 0 (no reverb). 0.5 = 50% of main volume. */
	reverbRatio?: number, // CHANGED
	/** Duration of an optional reverb effect in seconds. Required if reverbRatio is specified. */
	reverbDuration?: number,
	/**
	 * Playback rate of the sound. Default: 1. 1 = normal speed & pitch
	 * Lower = slower & lower pitch. Higher = faster & higher pitch.
	 */
	playbackRate?: number
	/** Whether the sound should loop indefinitely. Default: false */
	loop?: boolean,
}


// Constants ----------------------------------------------------------------------------------------------


/** The timestamps where each game sound effect starts and ends inside our sound spritesheet. */
const soundStamps = {
	gamestart: [0, 2],
	move: [2, 2.21],
	capture: [2.21,2.58],
	bell: [2.58,5.57],
	lowtime: [5.57, 6.30],
	win: [6.30, 8.30],
	draw: [8.30, 10.31],
	loss: [10.31, 12.32],
	drum1: [12.32, 16.32],
	drum2: [16.32, 19.57],
	tick: [19.57, 25.32],
	ticking: [25.32, 36.82],
	viola_staccato_c3: [36.82, 38.82],
	violin_staccato_c4: [38.82, 40.82],
	marimba_c2: [40.82, 42.82],
	marimba_c2_soft: [42.82, 44.82],
	base_staccato_c2: [44.82, 46.82],
	// draw_offer: [46.89, 48.526]   Only present for the sound spritesheet in dev-utils that includes the draw offer sound
} as const;

type SoundName = keyof typeof soundStamps;


/** Any volume above this is probably a mistake, so we reset it to 1 and log an error in the console. */
const VOLUME_DANGER_THRESHOLD = 4;


// State ----------------------------------------------------------------------------------------------


/** This context plays all our sounds. */
let audioContext: AudioContext;
/** The decoded audio buffer of our sound spritesheet. */
let audioDecodedBuffer: AudioBuffer;


// Initialization ----------------------------------------------------------------------------------


/** Returns our Audio Context */
function getAudioContext(): AudioContext {
	return audioContext;
}

/**
 * Sets our audio context and decodedBuffer. This is called from our in-line javascript inside the html.
 *
 * The sound spritesheet is loaded using javascript instead of an element
 * inside the document, because I need to grab the buffer.
 * And we put the javascript inline in the html to start it loading quicker,
 * because otherwise our sound only starts loading AFTER everything single script has loaded.
 * @param audioCtx
 * @param decodedBuffer - The decoded buffer of the loaded sound spritesheet.
 */
function initAudioContext(audioCtx: AudioContext, decodedBuffer: AudioBuffer): void {
	audioContext = audioCtx;
	audioDecodedBuffer = decodedBuffer;
}


// Sound Playing ------------------------------------------------------------------------------------------


/** Plays the specified sound effect, with various options. */
function playSound(soundName: SoundName, playOptions: PlaySoundOptions = {}): SoundObject | undefined {
	if (!htmlscript.hasUserGesturedAtleastOnce()) return; // Skip playing this sound (browsers won't allow it if we try, not until the user first interacts with the page)
	if (!audioContext) throw Error(`Can't play sound ${soundName} when audioContext isn't initialized yet. (Still loading)`);

	// CHANGED: Added `loop`, removed `fadeInDuration`
	const { volume = 1, delay = 0, offset = 0, reverbRatio = 0, reverbDuration, playbackRate = 1, loop = false } = playOptions;

	const soundStamp = getSoundStamp(soundName); // [ timeStart, timeEnd ] Start and end time stamps in the sprite
	const offsetSecs = offset / 1000;
	const startTime = soundStamp[0] + offsetSecs;
	const duration = getStampDuration(soundStamp) - offsetSecs; // Length of the sound effect in the sprite, in seconds
	if (duration < 0) return; // Offset is greater than the sound length, the sound is already over.

	// Calculate the desired start time by adding the delay
	const currentTime = audioContext.currentTime;
	const startAt = currentTime + delay;

	// We need an audio "source" to play our main sound effect. Several of these can exist at once for one audio context.

	// Create the main audio source
	const mainSource = createBufferSource(volume, playbackRate);
	mainSource.loop = loop; // Set the loop property on the audio source itself.

	// Create the reverb source if needed
	let reverbSource: AudioBufferWithGainNode | undefined = undefined;
	if (reverbRatio > 0) {
		if (!reverbDuration) throw Error("Need to specify a reverb duration.");
		const initialReverbVolume = volume * reverbRatio; // Calculate initial relative volume
		reverbSource = createBufferSource(initialReverbVolume, playbackRate, reverbDuration);
		reverbSource.loop = loop;
	}

	const soundObject: SoundObject = {
		source: mainSource,
		sourceReverb: reverbSource,
		looping: loop,
		_reverbRatio: reverbRatio,

		stop: (): void => {
			soundObject.source.stop();
			if (soundObject.sourceReverb) soundObject.sourceReverb.stop();
		},
		fadeOut: (durationMillis): void => {
			const fadeOutDurationSecs = durationMillis / 1000;
			const now = audioContext.currentTime;
			const fadeOutEndTime = now + fadeOutDurationSecs;
			// Fade out the main source
			fadeOut(soundObject.source, fadeOutEndTime);
			// Fade out the reverb source if it exists
			if (soundObject.sourceReverb) {
				fadeOut(soundObject.sourceReverb, fadeOutEndTime);
			}
			// For non-looping sounds, schedule them to stop completely after the fade.
			if (!soundObject.looping) setTimeout(() => soundObject.stop(), durationMillis);
		},
		fadeIn: (targetVolume, durationMillis): void => {
			const fadeInDurationSecs = durationMillis / 1000;
			const now = audioContext.currentTime;
			const fadeInEndTime = now + fadeInDurationSecs;
			// Fade in the main source to the specified target volume
			fadeIn(soundObject.source, targetVolume, fadeInEndTime);
			// Fade in the reverb source, retaining its original ratio
			if (soundObject.sourceReverb) {
				// Calculate the reverb's target volume based on the main target and the stored ratio.
				const targetReverbVolume = targetVolume * soundObject._reverbRatio;
				fadeIn(soundObject.sourceReverb, targetReverbVolume, fadeInEndTime);
			}
		}
	};

	// Start the main source
	soundObject.source.start(startAt, startTime, duration);
	// Start the reverb source if it exists
	if (soundObject.sourceReverb) soundObject.sourceReverb.start(startAt, startTime, duration);

	return soundObject;
}

/** Retrieves the sound time snippet for the specified sound. */
function getSoundStamp(soundName: SoundName): SoundTimeSnippet {
	const stamp = soundStamps[soundName];
	if (!stamp) throw new Error(`Cannot return sound stamp for unknown sound "${soundName}".`);
	return stamp;
}

/** Calculates the duration of a sound time snippet in seconds. */
function getStampDuration(stamp: SoundTimeSnippet): number { // [ startTimeSecs, endTimeSecs ]
	return stamp[1] - stamp[0];
}


// Audio Nodes ------------------------------------------------------------------------------------------


/**
 * Creates a new buffer source. These play our audio. Multiple sources can play multiple sounds at once.
 * Attaches the gain node to the source as the property `gainNode`.
 * @param volume - The volume the gain node will be set at
 * @param playbackRate - How fast the audio is player. Lower = slower & lower pitch. Higher = faster & higher pitch.
 * @param [reverbDurationSecs] Optional. If specified, the sound will be transformed into a reverb. This is the duration of that reverb in seconds.
 * @returns The source
 */
function createBufferSource(volume: number, playbackRate: number = 1, reverbDurationSecs: number = 0): AudioBufferWithGainNode {
	const source = audioContext.createBufferSource();
	if (!audioDecodedBuffer) throw new Error("audioDecodedBuffer should never be undefined! This usually happens when soundspritesheet.mp3 starts loading but the document finishes loading in the middle of the audio loading.");
	source.buffer = audioDecodedBuffer;

	// What nodes do we want?

	const nodes: (GainNode | ConvolverNode)[] = [];

	// Gain (Volume) node
	const gain = generateGainNode(audioContext, volume);
	nodes.push(gain);
	// @ts-ignore
	source.gainNode = gain; // Attach to the source object so that it can be faded out/in on demand.

	// Reverb node (if specified)
	if (reverbDurationSecs > 0) {
		const convolver = generateConvolverNode(audioContext, reverbDurationSecs);
		nodes.push(convolver);
	}

	// Playback rate (speed & pitch) is NOT a node.
	// This does not effect the duration of any applied reverb.
	source.playbackRate.value = playbackRate;

	connectSourceToDestinationWithNodes(source, audioContext, nodes);

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

/** Generates a reverb effect node. */
function generateConvolverNode(audioContext: AudioContext, durationSecs: number): ConvolverNode {
	const impulse = impulseResponse(durationSecs);
	return new ConvolverNode(audioContext, {buffer:impulse});
}

/** The mathematical function used by the convolver (reverb) node used to calculate the reverb effect! */
function impulseResponse(duration: number): AudioBuffer { // Duration in seconds, decay
	const decay = 2;
	const sampleRate = audioContext.sampleRate;
	const length = sampleRate * duration;
	const impulse = audioContext.createBuffer(1, length, sampleRate);
	const IR = impulse.getChannelData(0);
	for (let i = 0; i < length; i++) IR[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length,decay);
	return impulse;
}

/**
 * After an audio source buffer is created, it must be connected to the destination for us to hear sound!
 * Optionally, we can include nodes for modying the sound! Gain (volume), reverb...
 */
function connectSourceToDestinationWithNodes(source: AudioBufferSourceNode, context: AudioContext, nodeList: (GainNode | ConvolverNode)[]): void {
	let currentConnection: AudioBufferSourceNode | GainNode | ConvolverNode = source; // Start at the beginning

	for (const thisNode of nodeList) {
		// Connect the current connection to this node!
		currentConnection.connect(thisNode);
		// Prep for next iteration
		currentConnection = thisNode;
	}

	// Finally connect to the destnation!
	currentConnection.connect(context.destination);

	// Only connect the source directly to the destination if we
	// aren't going through any nodes!!
	// source.connect(audioContext.destination);
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
	SoundObject
};

export default {
	getAudioContext,
	initAudioContext,
	playSound,
};

// We set this variable on the global object so that htmlscript can access them within the html document.
// Only funcs necesary to htmlscript are here, if you need sound.js import it please
// @ts-ignore
globalThis.sound = {
	getAudioContext,
	initAudioContext
};
