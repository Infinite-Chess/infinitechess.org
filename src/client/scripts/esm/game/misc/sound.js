
// Import Start
import thread from '../../util/thread.js';
// Import End

"use strict";

/** This script controls the playing of our sound effects. */

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
};

/** @type {AudioContext} */
let audioContext;
/** @type {AudioBuffer} */
let audioDecodedBuffer;

const bellDist = 1_000_000; // Distance to start playing the bell gong!
const minReverbDist = 15; // 15 Reverb will *start increasing in volume
const maxReverbDist = 80; // 80 Reverb will sound the loudest at this distance!
const maxReverbVol = 3.5;
const reverbDuration = 1.5;

// How much quieter are moves when "dampened" (fast forwarding)?
const amountToDampenSkippedMoves = 0.5;
const amountToDampenSkippedBell = 0.3;

// This is to fix castling being twice as loud
let timeLastMoveSoundPlayed = 0;
const millisBetwMoveSounds = 35;

// Functions

/**
 * Returns our Audio Context
 * @returns {AudioContext}
 */
function getAudioContext() { return audioContext; }

/**
 * Sets our audio context and decodedBuffer. This is called from our in-line javascript inside the html.
 * 
 * The sound spritesheet is loaded using javascript instead of an element
 * inside the document, because I need to grab the buffer.
 * And we put the javascript inline in the html to start it loading quicker,
 * because otherwise our sound only starts loading AFTER everything single script has loaded.
 * @param {AudioContext} audioCtx 
 * @param {AudioBuffer} decodedBuffer 
 */
function initAudioContext(audioCtx, decodedBuffer) {
	audioContext = audioCtx;
	audioDecodedBuffer = decodedBuffer;
}

function playSound(soundName, { volume = 1, delay = 0, offset = 0, fadeInDuration, reverbVolume, reverbDuration } = {}) {
	// A reverb volume of 3.5 and a duration of 1.5 seconds most-closely matches my audio file!
	if (!htmlscript.hasUserGesturedAtleastOnce()) return; // Skip playing this sound 
    
	if (!audioContext) return console.error(`Can't play sound ${soundName} when audioContext isn't initialized yet. (Still loading)`);

	const soundStamp = getSoundStamp(soundName); // [ timeStart, timeEnd ] Start and end time stamps in the sprite
	const offsetSecs = offset / 1000;
	const startTime = soundStamp[0] + offsetSecs;
	const duration = getStampDuration(soundStamp) - offsetSecs; // Length of the sound effect in the sprite
	if (duration < 0) return; // Offset is greater than the sound length, the sound is already over.

	// Calculate the desired start time by adding the delay
	const currentTime = audioContext.currentTime;
    
	const startAt = currentTime + delay;

	const soundObject = {
		/** The source of the audio, with its attached `gainNode`. @type {AudioBufferSourceNode} */
		source: undefined,
		/** The source of the reverb-only part of the audio, if specified, with its attached `gainNode`. @type {AudioBufferSourceNode} */
		sourceReverb: undefined,
		/**
         * Stops the sound from playing. Could create static pops, if that happens use fadeOut() instead.
         * @param {number} durationMillis - The duration of the fade out
         */
		stop: () => {
			soundObject.source.stop();
			if (soundObject.sourceReverb) soundObject.sourceReverb.stop();
		},
		/**
         * Fades out the sound.
         * @param {number} durationMillis - The duration of the fade out
         */
		fadeOut: (durationMillis) => {
			fadeOut(soundObject.source, durationMillis);
			if (soundObject.sourceReverb) fadeOut(soundObject.sourceReverb, durationMillis);
		}
	};

	// 1. We need an audio "source" to play our main sound effect
    
	const source = createBufferSource(volume);
	source.start(startAt, startTime, duration);
	soundObject.source = source;

	// 2. If reverb is specified, we also need a source for that effect!
	// We will play them both!
	if (!reverbVolume) return fadeInAndReturn(); // No reverb effect if volume is falsey or zero :)
	if (reverbDuration == null) return console.error("Need to specify a reverb duration.");
	const sourceReverb = createBufferSource(reverbVolume, 1, reverbDuration);
	sourceReverb.start(startAt, startTime, duration);
	soundObject.sourceReverb = sourceReverb;

	return fadeInAndReturn();

	function fadeInAndReturn() {
		if (fadeInDuration == null) return soundObject; // No fade-in effect
		fadeIn(soundObject.source, volume, fadeInDuration);
		if (soundObject.sourceReverb) fadeIn(soundObject.sourceReverb, reverbVolume, fadeInDuration);
		return soundObject;
	}
}

function getSoundStamp(soundName) {
	const stamp = soundStamps[soundName];
	if (stamp) return stamp;
	else throw new Error(`Cannot return sound stamp for strange new sound ${soundName}!`);
}

function getStampDuration(stamp) { // [ startTimeSecs, endTimeSecs ]
	return stamp[1] - stamp[0];
}

// Buffer sources play our audio. Multiple of them can play multiple sounds at once.

/**
 * Creates a new buffer source. These play our audio. Multiple sources can play multiple sounds at once.
 * Attaches the gain node to the source as the property `gainNode`.
 * @param {number} volume - The volume the gain node will be set at
 * @param {number} playbackRate - How fast the audio is player. Lower = slower & lower pitch. Higher = faster & higher pitch.
 * @param {number} [reverbDurationSecs] Optional. If specified, the sound will be transformed into a reverb. This is the duration of that reverb in seconds.
 * @returns {AudioBufferSourceNode} The source
 */
function createBufferSource(volume, playbackRate = 1, reverbDurationSecs) {
	const source = audioContext.createBufferSource();
	if (audioDecodedBuffer == null) throw new Error("audioDecodedBuffer should never be undefined! This usually happens when soundspritesheet.mp3 starts loading but the document finishes loading in the middle of the audio loading.");
	source.buffer = audioDecodedBuffer; // Assuming `decodedBuffer` is defined elsewhere

	// What nodes do we want?

	const nodes = [];

	// Gain (Volume) node
	const gain = generateGainNode(audioContext, volume);
	nodes.push(gain);
	source.gainNode = gain; // Attach to the source object so that it can be faded out/in on demand.

	// Reverb node (if specified)
	if (reverbDurationSecs != null) {
		const convolver = generateConvolverNode(audioContext, reverbDurationSecs);
		nodes.push(convolver);
	}

	// Playback rate (speed & pitch) is NOT a node.
	// This does not effect the duration of any applied reverb.
	source.playbackRate.value = playbackRate;

	connectSourceToDestinationWithNodes(source, audioContext, nodes);

	return source;
}

// Reverb node
function generateConvolverNode(audioContext, durationSecs) {
	const impulse = impulseResponse(durationSecs);
	return new ConvolverNode(audioContext, {buffer:impulse});
}

/**
 * Generates a gain node for affecting the volume of sounds.
 * @param {AudioContext} audioContext 
 * @param {number} volume 
 * @returns {GainNode}
 */
function generateGainNode(audioContext, volume) {
	if (volume > 4) {
		console.error(`Gain was DANGEROUSLY set to ${volume}!!!! Resetting to 1.`);
		volume = 1;
	}
	const gainNode = audioContext.createGain();
	gainNode.gain.value = volume; // Set the volume level (0 to 1)
	return gainNode;
}

// The mathematical function used by the convolver (reverb) node used to calculate the reverb effect!
function impulseResponse(duration) { // Duration in seconds, decay
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
function connectSourceToDestinationWithNodes(source, context, nodeList) { // nodeList is optional

	let currentConnection = source; // Start at the beginning

	for (let i = 0; i < nodeList.length; i++) {
		// Connect the current connection to this node!
		const thisNode = nodeList[i];
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
 * @param {AudioBufferSourceNode} source - The audio source node to fade in, WITH ITS `gainNode` property attached.
 * @param {number} targetVolume - The final volume level.
 * @param {number} fadeDuration - The duration of the fade-in effect in milliseconds.
 */
function fadeIn(source, targetVolume, fadeDuration) {
	if (!source?.gainNode) throw new Error("Source or gain node not provided");
	const currentTime = audioContext.currentTime;
	source.gainNode.gain.setValueAtTime(0, currentTime);
	source.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration / 1000);
}

/**
 * Fades out the audio source over a specified duration.
 * This can be used to prevent static pops when abruptly stopping audio.
 * This will be useful for fading out music, and can be tweaked to fade in music.
 * @param {AudioBufferSourceNode} source - The audio source node to fade out, WITH ITS `gainNode` property attached.
 * @param {number} durationMillis - The duration of the fade-out effect in milliseconds.
 */
function fadeOut(source, durationMillis) {
	if (!source?.gainNode) throw new Error("Source or gain node not provided");

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


// Sounds

async function playSound_move(distanceMoved, dampen) {
	await sleepIfSoundsPlayedTooRapidly();

	const bell = distanceMoved >= bellDist;
	const dampener = dampen && bell ? amountToDampenSkippedBell : dampen ? amountToDampenSkippedMoves : 1;
	const volume = 1 * dampener;
	// eslint-disable-next-line prefer-const
	let { reverbVolume, reverbDuration } = calculateReverbVolDurFromDistance(distanceMoved);
	reverbVolume *= dampener;
	playSound('move', { volume, reverbVolume, reverbDuration });

	if (bell) {
		const bellVolume = 0.6 * dampener;
		playSound('bell', bellVolume);
	}

	timeLastMoveSoundPlayed = Date.now(); // This fixes castling being twice as loud
}

// This fixes castling being twice as loud
async function sleepIfSoundsPlayedTooRapidly() {
	const timeSinceLastMoveSoundPlayed = Date.now() - timeLastMoveSoundPlayed;

	if (timeSinceLastMoveSoundPlayed >= millisBetwMoveSounds) return;

	const timeLeft = millisBetwMoveSounds - timeSinceLastMoveSoundPlayed;
	await thread.sleep(timeLeft);
}

function playSound_capture(distanceMoved, dampen) {
	const bell = distanceMoved >= bellDist;
	const dampener = dampen && bell ? amountToDampenSkippedBell : dampen ? amountToDampenSkippedMoves : 1;
	const volume = 1 * dampener;
	// eslint-disable-next-line prefer-const
	let { reverbVolume, reverbDuration } = calculateReverbVolDurFromDistance(distanceMoved);
	reverbVolume *= dampener;
	playSound('capture', { volume, reverbVolume, reverbDuration });

	if (distanceMoved >= bellDist) {
		const bellVolume = 0.6 * dampener;
		playSound('bell', bellVolume);
	}
}

// Returns { reverbVol, reverbDur } from provided distance Chebyshev distance the piece moved;
function calculateReverbVolDurFromDistance(distanceMoved) {
	const x = (distanceMoved - minReverbDist) / (maxReverbDist - minReverbDist); // 0-1
	if (x <= 0) return { reverbVolume: null, reverbDuration: null };
	else if (x >= 1) return { reverbVolume: maxReverbVol, reverbDuration };

	function equation(x) { return x; } // Linear for now

	const y = equation(x);

	const reverbVolume = maxReverbVol * y;

	return { reverbVolume, reverbDuration };
}

function playSound_gamestart() {
	return playSound('gamestart', { volume: 0.4 });
}

function playSound_win(delay) {
	return playSound('win', { volume: 0.7, delay });
}

function playSound_draw(delay) {
	return playSound('draw', { volume: 0.7, delay });
}

// function playSound_drawOffer(delay) {
//     return playSound('draw_offer', { volume: 0.7, delay })
// }

function playSound_loss(delay) {
	return playSound('loss', { volume: 0.7, delay });
}

function playSound_lowtime() {
	return playSound('lowtime');
}

function playSound_drum() {
	const oneOrTwo = Math.random() > 0.5 ? 1 : 2; // Randomly choose which drum. They sound ever slightly different.
	const soundName = `drum${oneOrTwo}`;
	return playSound(soundName, { volume: 0.7 });
}

function playSound_tick({ volume, fadeInDuration, offset } = {}) {
	return playSound('tick', { volume, offset, fadeInDuration }); // Default volume: 0.07
}

function playSound_ticking({ fadeInDuration, offset } = {}) {
	return playSound('ticking', { volume: 0.18, offset, fadeInDuration });
}

function playSound_viola_c3({ volume } = {}) {
	return playSound('viola_staccato_c3', { volume });
}

function playSound_violin_c4() {
	return playSound('violin_staccato_c4', { volume: 0.9 });
}

function playSound_marimba() {
	const soft = Math.random() > 0.15 ? '_soft' : '';
	const audioName = `marimba_c2${soft}`;
	return playSound(audioName, { volume: 0.4 });
}

function playSound_base() {
	return playSound('base_staccato_c2', { volume: 0.8 });
}

export default {
	getAudioContext,
	initAudioContext,
	playSound_gamestart,
	playSound_move,
	playSound_capture,
	playSound_lowtime,
	playSound_win,
	playSound_draw,
	// playSound_drawOffer,
	playSound_loss,
	playSound_drum,
	playSound_tick,
	playSound_ticking,
	playSound_viola_c3,
	playSound_violin_c4,
	playSound_marimba,
	playSound_base
};

// We set this variable on the global object so that htmlscript can access them within the html document.
// Only funcs necesary to htmlscript are here, if you need sound.js import it please
globalThis.sound = {
	getAudioContext,
	initAudioContext
};