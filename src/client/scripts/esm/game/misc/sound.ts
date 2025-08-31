
// src/client/scripts/esm/game/misc/sound.ts

/**
 * This script controls the playing of our sound effects
 * from inside the sound spritesheet.
 */


// Type Definitions ----------------------------------------------------------------------------------


type AudioBufferWithGainNode = AudioBufferSourceNode & { gainNode: GainNode }

interface SoundObject {
	source: AudioBufferWithGainNode,
	sourceReverb?: AudioBufferWithGainNode,
	stop: () => void
	// eslint-disable-next-line no-unused-vars
	fadeOut: (durationMilis: number) => void
}

type SoundTimeSnippet = readonly [number, number]


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


// State ----------------------------------------------------------------------------------------------


let audioContext: AudioContext;
let audioDecodedBuffer: AudioBuffer;

// Functions ----------------------------------------------------------------------------------------------


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
 * @param decodedBuffer 
 */
function initAudioContext(audioCtx: AudioContext, decodedBuffer: AudioBuffer) {
	audioContext = audioCtx;
	audioDecodedBuffer = decodedBuffer;
}

function playSound(soundName: SoundName, { volume = 1, delay = 0, offset = 0, fadeInDuration = 0, reverbVolume = 0, reverbDuration = 0, playbackRate = 1 } = {}): SoundObject | undefined {
	// A reverb volume of 3.5 and a duration of 1.5 seconds most-closely matches my audio file!
	if (!htmlscript.hasUserGesturedAtleastOnce()) return; // Skip playing this sound 
    
	if (!audioContext) throw Error(`Can't play sound ${soundName} when audioContext isn't initialized yet. (Still loading)`);

	const soundStamp = getSoundStamp(soundName); // [ timeStart, timeEnd ] Start and end time stamps in the sprite
	const offsetSecs = offset / 1000;
	const startTime = soundStamp[0] + offsetSecs;
	const duration = getStampDuration(soundStamp) - offsetSecs; // Length of the sound effect in the sprite
	if (duration < 0) return; // Offset is greater than the sound length, the sound is already over.

	// Calculate the desired start time by adding the delay
	const currentTime = audioContext.currentTime;
    
	const startAt = currentTime + delay;

	const soundObject: SoundObject = {
		/** The source of the audio, with its attached `gainNode`. */
		source: createBufferSource(volume, playbackRate),
		/** The source of the reverb-only part of the audio, if specified, with its attached `gainNode`. */
		sourceReverb: undefined,
		/**
         * Stops the sound from playing. Could create static pops, if that happens use fadeOut() instead.
         */
		stop: () => {
			soundObject.source.stop();
			if (soundObject.sourceReverb) soundObject.sourceReverb.stop();
		},
		/**
         * Fades out the sound.
         * @param durationMillis - The duration of the fade out
         */
		fadeOut: (durationMillis) => {
			fadeOut(soundObject.source, durationMillis);
			if (soundObject.sourceReverb) fadeOut(soundObject.sourceReverb, durationMillis);
		}
	};

	// 1. We need an audio "source" to play our main sound effect
	soundObject.source.start(startAt, startTime, duration);

	// 2. If reverb is specified, we also need a source for that effect!
	// We will play them both!
	if (!reverbVolume) return fadeInAndReturn(); // No reverb effect if volume is falsey or zero :)
	if (!reverbDuration) throw Error("Need to specify a reverb duration.");
	soundObject.sourceReverb = createBufferSource(reverbVolume, playbackRate, reverbDuration);
	soundObject.sourceReverb.start(startAt, startTime, duration);

	return fadeInAndReturn();

	function fadeInAndReturn() {
		if (!fadeInDuration) return soundObject; // No fade-in effect
		fadeIn(soundObject.source, volume, fadeInDuration);
		if (soundObject.sourceReverb) fadeIn(soundObject.sourceReverb, reverbVolume, fadeInDuration);
		return soundObject;
	}
}

function getSoundStamp(soundName: SoundName): SoundTimeSnippet {
	const stamp = soundStamps[soundName];
	if (stamp) return stamp;
	else throw new Error(`Cannot return sound stamp for strange new sound ${soundName}!`);
}

function getStampDuration(stamp: SoundTimeSnippet) { // [ startTimeSecs, endTimeSecs ]
	return stamp[1] - stamp[0];
}

// Buffer sources play our audio. Multiple of them can play multiple sounds at once.

/**
 * Creates a new buffer source. These play our audio. Multiple sources can play multiple sounds at once.
 * Attaches the gain node to the source as the property `gainNode`.
 * @param volume - The volume the gain node will be set at
 * @param playbackRate - How fast the audio is player. Lower = slower & lower pitch. Higher = faster & higher pitch.
 * @param [reverbDurationSecs] Optional. If specified, the sound will be transformed into a reverb. This is the duration of that reverb in seconds.
 * @returns The source
 */
function createBufferSource(volume: number, playbackRate: number = 1, reverbDurationSecs?: number): AudioBufferWithGainNode {
	const source = audioContext.createBufferSource();
	if (!audioDecodedBuffer) throw new Error("audioDecodedBuffer should never be undefined! This usually happens when soundspritesheet.mp3 starts loading but the document finishes loading in the middle of the audio loading.");
	source.buffer = audioDecodedBuffer; // Assuming `decodedBuffer` is defined elsewhere

	// What nodes do we want?

	const nodes: (GainNode|ConvolverNode)[] = [];

	// Gain (Volume) node
	const gain = generateGainNode(audioContext, volume);
	nodes.push(gain);
	// @ts-ignore
	source.gainNode = gain; // Attach to the source object so that it can be faded out/in on demand.

	// Reverb node (if specified)
	if (reverbDurationSecs !== undefined) {
		const convolver = generateConvolverNode(audioContext, reverbDurationSecs);
		nodes.push(convolver);
	}

	// Playback rate (speed & pitch) is NOT a node.
	// This does not effect the duration of any applied reverb.
	source.playbackRate.value = playbackRate;

	connectSourceToDestinationWithNodes(source, audioContext, nodes);

	return source as AudioBufferWithGainNode;
}

// Reverb node
function generateConvolverNode(audioContext: AudioContext, durationSecs: number) {
	const impulse = impulseResponse(durationSecs);
	return new ConvolverNode(audioContext, {buffer:impulse});
}

/**
 * Generates a gain node for affecting the volume of sounds.
 * @param {AudioContext} audioContext 
 * @param {number} volume 
 * @returns {GainNode}
 */
function generateGainNode(audioContext: AudioContext, volume: number): GainNode {
	if (volume > 4) {
		console.error(`Gain was DANGEROUSLY set to ${volume}!!!! Resetting to 1.`);
		volume = 1;
	}
	const gainNode = audioContext.createGain();
	gainNode.gain.value = volume; // Set the volume level (0 to 1)
	return gainNode;
}

// The mathematical function used by the convolver (reverb) node used to calculate the reverb effect!
function impulseResponse(duration: number) { // Duration in seconds, decay
	const decay = 2;
	const sampleRate = audioContext.sampleRate;
	const length = sampleRate * duration;
	const impulse = audioContext.createBuffer(1, length, sampleRate);
	const IR = impulse.getChannelData(0);
	for (let i = 0; i < length; i++) IR[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length,decay);
	return impulse;
}

// After an audio source buffer is created, it must be connected to the destination for us to hear sound!
// Optionally, we can include nodes for modying the sound! Gain (volume), reverb...
function connectSourceToDestinationWithNodes(source: AudioBufferSourceNode, context: AudioContext, nodeList: (GainNode|ConvolverNode)[]) { // nodeList is optional

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
	//source.connect(audioContext.destination);
}

/**
 * Fades in the audio by gradually increasing the volume.
 * @param source - The audio source node to fade in, WITH ITS `gainNode` property attached.
 * @param targetVolume - The final volume level.
 * @param fadeDuration - The duration of the fade-in effect in milliseconds.
 */
function fadeIn(source: AudioBufferWithGainNode, targetVolume: number, fadeDuration: number) {
	if (!source?.gainNode) throw new Error("Source or gain node not provided");
	const currentTime = audioContext.currentTime;
	source.gainNode.gain.setValueAtTime(0, currentTime);
	source.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration / 1000);
}

/**
 * Fades out the audio source over a specified duration.
 * This can be used to prevent static pops when abruptly stopping audio.
 * This will be useful for fading out music, and can be tweaked to fade in music.
 * @param source - The audio source node to fade out, WITH ITS `gainNode` property attached.
 * @param durationMillis - The duration of the fade-out effect in milliseconds.
 */
function fadeOut(source: AudioBufferWithGainNode, durationMillis: number) {
	if (!source?.gainNode) throw new Error("Source or gain node not provided"); // Hopefully This should be caught by TS

	const durationSecs = durationMillis / 1000;
	const currentTime = audioContext.currentTime;
	const endTime = currentTime + durationSecs;

	// First, set the gain value explicitly to ensure starting point for ramp
	source.gainNode.gain.setValueAtTime(source.gainNode.gain.value, currentTime);
	// Schedule the gain node to fade out
	source.gainNode.gain.linearRampToValueAtTime(0, endTime);

	// Stop the audio after fade-out duration.
	// This needs to be like this to have the proper *this* object when calling,
	// otherwise we get "Illegal invocation" error.
	setTimeout(() => { source.stop(); }, durationMillis);
}



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
