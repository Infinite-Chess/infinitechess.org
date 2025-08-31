
// src/client/scripts/esm/game/misc/gamesound.ts

import bd, { BigDecimal } from "../../util/bigdecimal/bigdecimal.js";
import sound from "./sound.js";

/**
 * This script is in charge of playing game sound effects.
 * It takes variables such as distances pieces moved
 * so it can deduce the correct sound play options when
 * calling {@link sound.playSound}.
 */


// Constants --------------------------------------------------------------------------


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
	volume: 3.5,
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


// Variables --------------------------------------------------------------------------


/** Timestamp of the last played move sound. */
let timeLastMoveOrCaptureSound = 0;


// Playing Sounds -----------------------------------------------------------------------------


/**
 * Plays a piece move sound effect.
 * Automatically handles effects such as capture, reverb, bell, dampening, etc.
 * @param distanceMoved - How far the piece moved.
 * @param capture - Whether this move made a capture.
 * @param premove - Whether this move is a premove.
 */
function playMove(distanceMoved: BigDecimal, capture: boolean, premove: boolean) {
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
	// eslint-disable-next-line prefer-const
	let { reverbVolume, reverbDuration } = calculateReverbOptions(distanceMoved);
	if (reverbVolume) reverbVolume *= dampener;

	sound.playSound(soundEffectName, { volume, reverbVolume, reverbDuration, delay: delaySecs, playbackRate });

	if (bd.compare(distanceMoved, BELL_CONFIG.minDist) >= 0) { // Play the bell sound too
		const bellVolume = BELL_CONFIG.volume * dampener;
		sound.playSound('bell', { volume: bellVolume, delay: delaySecs, playbackRate });
	}
}

/** Takes the distance a piece moved, and returns applicable reverbVol and reverbDur options. */
function calculateReverbOptions(distanceMoved: BigDecimal): { reverbVolume: number, reverbDuration: number } | { reverbVolume: undefined, reverbDuration: undefined } {
	const distanceMovedNum = bd.toNumber(distanceMoved);
	const x = (distanceMovedNum - REVERB_CONFIG.minDist) / (REVERB_CONFIG.maxDist - REVERB_CONFIG.minDist); // 0-1
	if (x <= 0) return { reverbVolume: undefined, reverbDuration: undefined };
	else if (x >= 1) return { reverbVolume: REVERB_CONFIG.volume, reverbDuration: REVERB_CONFIG.duration };

	const reverbVolume = REVERB_CONFIG.volume * x; // No easing applied, for now

	return { reverbVolume, reverbDuration: REVERB_CONFIG.duration };
}

function playGamestart() {
	return sound.playSound('gamestart', { volume: 0.4 });
}

function playWin(delay?: number) {
	return sound.playSound('win', { volume: 0.7, delay });
}

function playDraw(delay?: number) {
	return sound.playSound('draw', { volume: 0.7, delay });
}

function playLoss(delay?: number) {
	return sound.playSound('loss', { volume: 0.7, delay });
}

function playLowtime() {
	return sound.playSound('lowtime');
}

function playDrum() {
	const soundName = Math.random() > 0.5 ? 'drum1' : 'drum2'; // Randomly choose which drum. They sound ever slightly different.
	return sound.playSound(soundName, { volume: 0.7 });
}

/** Plays a few clock ticks at 1 minute remaining. */
function playTick({
	volume,
	fadeInDuration,
	offset
}: {
	volume?: number
	fadeInDuration?: number,
	offset?: number
} = {}) {
	return sound.playSound('tick', { volume, offset, fadeInDuration }); // Default volume: 0.07
}

/** Plays the ticking ambience during the last 10 seconds of timer remaining. */
function playTicking(
	{
		fadeInDuration,
		offset
	}: {
		fadeInDuration?: number,
		offset?: number
	} = {}
) {
	return sound.playSound('ticking', { volume: 0.18, offset, fadeInDuration });
}

function playViola_c3({ volume }: { volume?: number } = {}) {
	return sound.playSound('viola_staccato_c3', { volume });
}

function playViolin_c4() {
	return sound.playSound('violin_staccato_c4', { volume: 0.9 });
}

function playMarimba() {
	const audioName = Math.random() > 0.15 ? 'marimba_c2_soft' : 'marimba_c2';
	return sound.playSound(audioName, { volume: 0.4 });
}

function playBase() {
	return sound.playSound('base_staccato_c2', { volume: 0.8 });
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