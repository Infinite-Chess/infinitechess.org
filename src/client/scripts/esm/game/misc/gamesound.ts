
// src/client/scripts/esm/game/misc/gamesound.ts

import bd, { BigDecimal } from "../../util/bigdecimal/bigdecimal.js";
import sound from "./sound.js";

/**
 * This script
 */


// Constants --------------------------------------------------------------------------



const bellDist = bd.FromBigInt(1_000_000n); // Distance to start playing the bell gong!
const minReverbDist = 15; // 15 Reverb will *start increasing in volume
const maxReverbDist = 80; // 80 Reverb will sound the loudest at this distance!
const maxReverbVol = 3.5;
const reverbDuration = 1.5;

// How much quieter are moves when "dampened" (fast forwarding)?
const amountToDampenMoves = 0.5;
const amountToDampenBell = 0.5;

// Premove constants
const playbackRatePremoves = 1.5; // Premove sounds are played faster, so they sound more like a click.
const volumeDampenerPremoves = 0.5; // Premove sounds are slightly quieter


/** Timestamp of the last time {@link playSound_move} or {@link playSound_capture} was called. */
let timeLastMoveOrCaptureSound = 0;
/** If move/capture sounds are played within this time, they get delayed until this time has passed.
 * This is to prevent sounds from playing at the same time, such as castling. */
const minMillisBetwMoveOrCaptureSounds = 35;
/** If move/capture sounds are played within this time, they get dampened */
const dampenThresholdMillis = 60;


// Playing Sounds -----------------------------------------------------------------------------


// Sounds

function playSound_move(distanceMoved: BigDecimal, premove = false) {
	// Update the time since the last move sound was played
	const now = Date.now();
	const timeSinceLastMoveSoundPlayed = now - timeLastMoveOrCaptureSound;
	timeLastMoveOrCaptureSound = now; // Update timestamp *after* checking

	// Determine if we should add delay (sounds played at same time)
	const delay = (Math.max(0, minMillisBetwMoveOrCaptureSounds - timeSinceLastMoveSoundPlayed)) / 1000;

	// Determine if we should dampen the sound (sounds played too rapidly)
	const shouldDampen = timeSinceLastMoveSoundPlayed < dampenThresholdMillis;

	const playBell = bd.compare(distanceMoved, bellDist) >= 0;
	const dampener = shouldDampen && playBell ? amountToDampenBell : shouldDampen ? amountToDampenMoves : 1;
	const volume = 1 * dampener * (premove ? volumeDampenerPremoves : 1); // Premoves are slightly quieter
	const playbackRate = premove ? playbackRatePremoves : 1; // Premove moves are played faster, so they sound more like a click.
	// eslint-disable-next-line prefer-const
	let { reverbVolume, reverbDuration } = calculateReverbVolDurFromDistance(distanceMoved);
	if (reverbVolume) reverbVolume *= dampener;
	sound.playSound('move', { volume, reverbVolume, reverbDuration, delay, playbackRate });

	if (playBell) {
		const bellVolume = 0.6 * dampener;
		sound.playSound('bell', { volume: bellVolume, delay, playbackRate });
	}
}

function playSound_capture(distanceMoved: BigDecimal, premove = false) {
	// Update the time since the last move sound was played
	const now = Date.now();
	const timeSinceLastMoveSoundPlayed = now - timeLastMoveOrCaptureSound;
	timeLastMoveOrCaptureSound = now; // Update timestamp *after* checking

	// Determine if we should add delay (sounds played at same time)
	const delay = (Math.max(0, minMillisBetwMoveOrCaptureSounds - timeSinceLastMoveSoundPlayed)) / 1000;
	
	// Determine if we should dampen the sound (sounds played too rapidly)
	const shouldDampen = timeSinceLastMoveSoundPlayed < dampenThresholdMillis;

	const playBell = bd.compare(distanceMoved, bellDist) >= 0;
	const dampener = shouldDampen && playBell ? amountToDampenBell : shouldDampen ? amountToDampenMoves : 1;
	const volume = 1 * dampener * (premove ? volumeDampenerPremoves : 1); // Premoves are slightly quieter
	const playbackRate = premove ? playbackRatePremoves : 1; // Premove captures are played faster, so they sound more like a click.
	// eslint-disable-next-line prefer-const
	let { reverbVolume, reverbDuration } = calculateReverbVolDurFromDistance(distanceMoved);
	if (reverbVolume) reverbVolume *= dampener;
	sound.playSound('capture', { volume, reverbVolume, reverbDuration, delay, playbackRate });

	if (playBell) {
		const bellVolume = 0.6 * dampener;
		sound.playSound('bell', { volume: bellVolume, delay, playbackRate });
	}
}

// Returns { reverbVol, reverbDur } from provided distance Chebyshev distance the piece moved;
function calculateReverbVolDurFromDistance(distanceMoved: BigDecimal) {
	const x = (distanceMoved - minReverbDist) / (maxReverbDist - minReverbDist); // 0-1
	if (x <= 0) return { reverbVolume: undefined, reverbDuration: undefined };
	else if (x >= 1) return { reverbVolume: maxReverbVol, reverbDuration };

	function equation(x: number) { return x; } // Linear for now

	const y = equation(x);

	const reverbVolume = maxReverbVol * y;

	return { reverbVolume, reverbDuration };
}

function playSound_gamestart() {
	return sound.playSound('gamestart', { volume: 0.4 });
}

function playSound_win(delay?: number) {
	return sound.playSound('win', { volume: 0.7, delay });
}

function playSound_draw(delay?: number) {
	return sound.playSound('draw', { volume: 0.7, delay });
}

// function playSound_drawOffer(delay) {
//     return sound.playSound('draw_offer', { volume: 0.7, delay })
// }

function playSound_loss(delay?: number) {
	return sound.playSound('loss', { volume: 0.7, delay });
}

function playSound_lowtime() {
	return sound.playSound('lowtime');
}

function playSound_drum() {
	const soundName = Math.random() > 0.5 ? 'drum1' : 'drum2'; // Randomly choose which drum. They sound ever slightly different.
	return sound.playSound(soundName, { volume: 0.7 });
}

function playSound_tick(
	{
		volume,
		fadeInDuration,
		offset
	}: {
		volume?: number
		fadeInDuration?: number,
		offset?: number
	} = {}
) {
	return sound.playSound('tick', { volume, offset, fadeInDuration }); // Default volume: 0.07
}

function playSound_ticking(
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

function playSound_viola_c3({ volume }: { volume?: number } = {}) {
	return sound.playSound('viola_staccato_c3', { volume });
}

function playSound_violin_c4() {
	return sound.playSound('violin_staccato_c4', { volume: 0.9 });
}

function playSound_marimba() {
	const audioName = Math.random() > 0.15 ? 'marimba_c2_soft' : 'marimba_c2';
	return sound.playSound(audioName, { volume: 0.4 });
}

function playSound_base() {
	return sound.playSound('base_staccato_c2', { volume: 0.8 });
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