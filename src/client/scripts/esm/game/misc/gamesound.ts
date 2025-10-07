
// src/client/scripts/esm/game/misc/gamesound.ts

import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import sound, { SoundObject } from "./sound.js";

/**
 * This script is in charge of playing game sound effects.
 * It takes variables such as distances pieces moved
 * so it can deduce the correct sound play options when
 * calling {@link sound.playSound}.
 */


// Constants --------------------------------------------------------------------------


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

type SoundTimeSnippet = readonly [number, number];


// Move Configs --------------------------------------------------------------------------


/** Config for successive, or rapidly played move sounds. */
const SUCCESSIVE_MOVES_CONFIG = {
	/** If move sounds are played within this time, they get delayed until this amount time has passed, in milliseconds.
	 * This is to prevent sounds from playing at the exact same time, such as the king & rook while castling. */
	gap: 35,
	/** The threshold in milliseconds to count two move sounds as successive. */
	threshold: 60,
	/** The volume dampener for successive move sounds. */
	dampener: 0.5,
};
/** Config for controlling moves' reverb effect. */
const REVERB_CONFIG = {
	/** The maximum volume the reverb effect of a piece move can reach. */
	maxRatio: 3.5,
	/** The duration of moves' reverb effects, in seconds. */
	duration: 1.5,
	/** The minimum distance a piece needs to move for a reverb effect to gradually increase in volume. */
	minDist: 15,
	/** The distance a piece needs to move for the reverb effect to be at its max volume. */
	maxDist: 80,
};

/** Config for the bell gong sound effect when moves are extremely large. */
const BELL_CONFIG = {
	/** The distance a piece needs to move for the bell sound to play. */
	minDist: bd.FromBigInt(1_000_000n),
	/** The volume of the bell gongs. */
	volume: 0.6,
};

/** Config for playing premove sound effects. */
const PREMOVE_CONFIG = {
	/** Premove sounds are played faster so they sound more like a click. */
	volume: 0.5,
	/** Premove sounds are slightly quieter. */
	playbackRate: 1.5,
};


// Initiation Variables --------------------------------------------------------------------------


let spritesheetDecodedBuffer: AudioBuffer | undefined = undefined;


// State ------------------------------------------------------------------------------


/** Timestamp of the last played move sound. */
let timeLastMoveOrCaptureSound = 0;


// Spritesheet Buffer ----------------------------------------------------


// Fetch and decode the buffer of the sound spritesheet.
fetch('sounds/soundspritesheet.mp3')
	.then(response => response.arrayBuffer())
	.then(arrayBuffer => sound.decodeAudioData(arrayBuffer))
	.then(decodedBuffer => {
		spritesheetDecodedBuffer = decodedBuffer;
		console.log('Sound spritesheet loaded and decoded successfully.');
	})
	.catch(error => {
		const message = (error instanceof Error) ? error.message : String(error);
		console.error(`An error ocurred during loading of sound spritesheet: ${message}`);
	});

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

/** Retrieves the start time and duration of a sound inside the spritesheet. */
function getSoundTimeSnippet(soundName: SoundName): { startTime: number, duration: number } {
	const stamp = getSoundStamp(soundName);
	const startTime = stamp[0];
	const duration = getStampDuration(stamp);
	return { startTime, duration };
}


// Playing Sounds -----------------------------------------------------------------------------


/**
 * Plays a piece move sound effect.
 * Automatically handles effects such as capture, reverb, bell, dampening, etc.
 * @param distanceMoved - How far the piece moved.
 * @param capture - Whether this move made a capture.
 * @param premove - Whether this move is a premove.
 */
function playMove(distanceMoved: BigDecimal, capture: boolean, premove: boolean): void {
	// Update the time since the last move sound was played
	const now = Date.now();
	const timeSinceLastMoveSoundPlayed = now - timeLastMoveOrCaptureSound;
	timeLastMoveOrCaptureSound = now;

	const soundEffectName = capture ? 'capture' : 'move';

	// Determine if we should add delay (sounds played at same time, such as the king & rook while castling)
	const delaySecs = (Math.max(0, SUCCESSIVE_MOVES_CONFIG.gap - timeSinceLastMoveSoundPlayed)) / 1000;

	// Determine if we should dampen the sound (sounds played successively, close together)
	const shouldDampen = timeSinceLastMoveSoundPlayed < SUCCESSIVE_MOVES_CONFIG.threshold;
	const successiveDampener = shouldDampen ? SUCCESSIVE_MOVES_CONFIG.dampener : 1; // Successively played moves are quieter
	const premoveDampener = premove ? PREMOVE_CONFIG.volume : 1; // Premoves are slightly quieter
	const dampener = successiveDampener * premoveDampener; // Total dampener
	const volume = 1 * dampener;

	const playbackRate = premove ? PREMOVE_CONFIG.playbackRate : 1; // Premove moves are played faster, so they sound more like a click.
	
	const { reverbRatio, reverbDuration } = calculateReverbRatio(distanceMoved);

	const { startTime, duration } = getSoundTimeSnippet(soundEffectName);

	sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume, reverbRatio, reverbDuration, delay: delaySecs, playbackRate });

	if (bd.compare(distanceMoved, BELL_CONFIG.minDist) >= 0) { // Play the bell sound too
		const bellVolume = BELL_CONFIG.volume * dampener;
		const { startTime, duration } = getSoundTimeSnippet('bell');
		sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: bellVolume, delay: delaySecs, playbackRate });
	}
}

/** Takes the distance a piece moved, and returns the applicable reverb ratio and duration. */
function calculateReverbRatio(distanceMoved: BigDecimal): { reverbRatio: number, reverbDuration: number } | { reverbRatio: undefined, reverbDuration: undefined } {
	const distanceMovedNum = bd.toNumber(distanceMoved);
	const x = (distanceMovedNum - REVERB_CONFIG.minDist) / (REVERB_CONFIG.maxDist - REVERB_CONFIG.minDist); // 0-1
	if (x <= 0) return { reverbRatio: undefined, reverbDuration: undefined };
	else if (x >= 1) return { reverbRatio: REVERB_CONFIG.maxRatio, reverbDuration: REVERB_CONFIG.duration };

	const reverbRatio = REVERB_CONFIG.maxRatio * x; // No easing applied, for now

	return { reverbRatio, reverbDuration: REVERB_CONFIG.duration };
}

function playGamestart(): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('gamestart');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.4 });
}

function playWin(delay?: number): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('win');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.7, delay });
}

function playDraw(delay?: number): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('draw');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.7, delay });
}

function playLoss(delay?: number): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('loss');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.7, delay });
}

function playLowtime(): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('lowtime');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration });
}

function playDrum(): SoundObject | undefined {
	const soundName = Math.random() > 0.5 ? 'drum1' : 'drum2'; // Randomly choose which drum. They sound ever slightly different.
	const { startTime, duration } = getSoundTimeSnippet(soundName);
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.7 });
}

/** Plays a few clock ticks at 1 minute remaining. */
function playTick({ volume, offset}: { volume?: number, offset?: number } = {}): SoundObject | undefined {
	let { startTime, duration } = getSoundTimeSnippet('tick');
	
	// Adjust for offset
	const offsetSecs = offset ?? 0 / 1000;
	startTime += offsetSecs;
	duration -= offsetSecs;

	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume });
}

/** Plays the ticking ambience during the last 10 seconds of timer remaining. */
function playTicking({ volume, offset }: { volume?: number, offset?: number } = {}): SoundObject | undefined {
	let { startTime, duration } = getSoundTimeSnippet('ticking');

	// Adjust for offset
	const offsetSecs = offset ?? 0 / 1000;
	startTime += offsetSecs;
	duration -= offsetSecs;

	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume });
}

function playViola_c3({ volume }: { volume?: number } = {}): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('viola_staccato_c3');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume });
}

function playViolin_c4(): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('violin_staccato_c4');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.9 });
}

function playMarimba(): SoundObject | undefined {
	const audioName = Math.random() > 0.15 ? 'marimba_c2_soft' : 'marimba_c2';
	const { startTime, duration } = getSoundTimeSnippet(audioName);
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.4 });
}

function playBase(): SoundObject | undefined {
	const { startTime, duration } = getSoundTimeSnippet('base_staccato_c2');
	return sound.playSound(spritesheetDecodedBuffer, { startTime, duration, volume: 0.8 });
}


// Exports ------------------------------------------------------------------------------


export default {
	playMove,
	playGamestart,
	playWin,
	playDraw,
	playLoss,
	playLowtime,
	playDrum,
	playTick,
	playTicking,
	playViola_c3,
	playViolin_c4,
	playMarimba,
	playBase
};