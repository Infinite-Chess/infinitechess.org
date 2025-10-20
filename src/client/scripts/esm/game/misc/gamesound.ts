
// src/client/scripts/esm/game/misc/gamesound.ts

import type { EffectConfig } from "../../audio/AudioEffects.js";
import type { Coords } from "../../../../../shared/chess/util/coordutil.js";

import screenshake from "../rendering/screenshake.js";
import math from "../../../../../shared/util/math/math.js";
import WaterRipples from "../rendering/WaterRipples.js";
import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import AudioManager, { SoundObject } from "../../audio/AudioManager.js";

/**
 * This script is in charge of playing game sound effects.
 * It takes variables such as distances pieces moved
 * so it can deduce the correct sound play options when
 * calling {@link AudioManager.playAudio}.
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
	ripple: [46.82, 50.0],
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
} as const;
/** Config for controlling moves' reverb effect. */
const REVERB_CONFIG = {
	/** The maximum `wetLevel` to use for moves' reverb effects. */
	maxWetLevel: 3.5,
	/** The duration of moves' reverb effects, in seconds. */
	duration: 1.5,
	/** The minimum distance a piece needs to move for a reverb effect to gradually increase in volume. */
	minDist: 15,
	/** The distance a piece needs to move for the reverb effect to be at its max volume. */
	maxDist: 80,
} as const;

/** Config for the bell gong sound effect when moves are extremely large. */
const BELL_CONFIG = {
	/** The distance a piece needs to move for the bell sound to play. */
	minDist: bd.FromBigInt(1_000_000n),
	/** The volume of the bell gongs, as a multiplier to the move sound's volume. */
	volume: 0.6,
} as const;

/** The minimum distance a piece needs to move for the water droplet ripple effect to trigger. */
const RIPPLE_MIN_DIST = bd.FromBigInt(10n ** 100n); // 10^100 squares
// const RIPPLE_MIN_DIST = bd.FromBigInt(20n); // FOR TESTING

/** Config for the screen shake effect for very large moves. */
const SHAKE_CONFIG = {
	/** The order of magnitude distance a piece needs to move for the screen shake to begin triggering. */
	minDist: 4, // 10,000 squares => trauma begins increasing from 0
	/** How much screen shake trauma is added per order of magnitude the piece moved. */
	traumaMultiplier: 0.035,
	/**
	 * A delay in milliseconds before the screen shake is triggered, to better sync with the audio.
	 * ALSO CONTROLS DELAY of water ripple being added, too.
	 */
	delay: 70,
};

/** Config for playing premove sound effects. */
const PREMOVE_CONFIG = {
	/** Premove sounds are played faster so they sound more like a click. */
	playbackRate: 1.5,
	/** Premove sounds are slightly quieter. */
	volume: 0.5,
} as const;


// Initiation Variables --------------------------------------------------------------------------


let spritesheetDecodedBuffer: AudioBuffer | undefined = undefined;


// State ------------------------------------------------------------------------------


/** Timestamp of the last played move sound. */
let timeLastMoveOrCaptureSound = 0;


// Spritesheet Buffer ----------------------------------------------------


// Fetch and decode the buffer of the sound spritesheet.
fetch('sounds/soundspritesheet.mp3')
	.then(response => response.arrayBuffer())
	.then(arrayBuffer => AudioManager.decodeAudioData(arrayBuffer))
	.then(decodedBuffer => {
		spritesheetDecodedBuffer = decodedBuffer;
		// console.log('Sound spritesheet loaded and decoded successfully.');
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
 * Plays a sound by name from the spritesheet.
 * @param soundName The name of the sound to play.
 * @param options Optional parameters like volume, delay, and offset.
 * @returns A SoundObject if the sound is played, otherwise undefined.
 */
function playSoundEffect(soundName: SoundName, options: { volume?: number, delay?: number, offset?: number, reverbWetLevel?: number, reverbDuration?: number, playbackRate?: number } = {}): SoundObject | undefined {
	let { startTime, duration } = getSoundTimeSnippet(soundName);
	const { volume, delay, offset, reverbWetLevel, reverbDuration, playbackRate } = options;

	if (soundName === 'ripple') {
		// console.warn("Don't have new move sound effect in the sound spritesheet yet! Can't play it.");
		return;
	}

	// If offset is specified, adjust the start time and duration accordingly
	if (offset) {
		const offsetSecs = offset / 1000;
		startTime += offsetSecs;
		duration -= offsetSecs;
		// Don't play the sound if the offset exceeds the sound duration (can happen with 'tick' sound)
		if (duration <= 0) return;
	}

	// Add reverb effect if specified
	const effects: EffectConfig[] = [];
	if (reverbWetLevel && reverbDuration) effects.push({ type: 'reverb', durationSecs: reverbDuration, dryLevel: 1, wetLevel: reverbWetLevel });

	return AudioManager.playAudio(spritesheetDecodedBuffer, { startTime, duration, volume, delay, playbackRate, effects });
}

/**
 * Plays a piece move sound effect.
 * Automatically handles effects such as capture, reverb, bell, dampening, etc.
 * @param distanceMoved - How far the piece moved.
 * @param capture - Whether this move made a capture.
 * @param premove - Whether this move is a premove.
 */
function playMove(distanceMoved: BigDecimal, capture: boolean, premove: boolean, destination?: Coords): void {
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
	
	const { reverbWetLevel, reverbDuration } = calculateReverb(distanceMoved);

	playSoundEffect(soundEffectName, { volume, reverbWetLevel, reverbDuration, delay: delaySecs, playbackRate });

	
	if (destination && bd.compare(distanceMoved, RIPPLE_MIN_DIST) >= 0) {
		// Trigger water dropplet ripple effect
		setTimeout(() => WaterRipples.addRipple(destination), SHAKE_CONFIG.delay); // Delay slightly so it syncs better with the audio
		playSoundEffect('ripple', { volume, delay: delaySecs, playbackRate });
	} else {
		// Apply screen shake for very large moves
		const rawTrauma = (bd.log10(distanceMoved) - SHAKE_CONFIG.minDist) * SHAKE_CONFIG.traumaMultiplier;
		const trauma = math.clamp(rawTrauma, 0, 1);
		if (trauma > 0) setTimeout(() => screenshake.trigger(trauma), SHAKE_CONFIG.delay); // Delay slightly so it syncs better with the audio

		if (bd.compare(distanceMoved, BELL_CONFIG.minDist) >= 0) {
			// Move is large enough to play the bell sound too
			const bellVolume = BELL_CONFIG.volume * dampener;
			playSoundEffect('bell', { volume: bellVolume, delay: delaySecs, playbackRate });
		}
	}
}

/** Takes the distance a piece moved, and returns the applicable reverb wet level and duration. */
function calculateReverb(distanceMoved: BigDecimal): { reverbWetLevel: number, reverbDuration: number } | { reverbWetLevel: undefined, reverbDuration: undefined } {
	const distanceMovedNum = bd.toNumber(distanceMoved);
	const x = (distanceMovedNum - REVERB_CONFIG.minDist) / (REVERB_CONFIG.maxDist - REVERB_CONFIG.minDist); // 0-1
	if (x <= 0) return { reverbWetLevel: undefined, reverbDuration: undefined };
	else if (x >= 1) return { reverbWetLevel: REVERB_CONFIG.maxWetLevel, reverbDuration: REVERB_CONFIG.duration };

	const reverbWetLevel = REVERB_CONFIG.maxWetLevel * x; // No easing applied, for now

	return { reverbWetLevel, reverbDuration: REVERB_CONFIG.duration };
}

function playGamestart(): SoundObject | undefined {
	return playSoundEffect('gamestart', { volume: 0.4 });
}

function playWin(delay?: number): SoundObject | undefined {
	return playSoundEffect('win', { volume: 0.7, delay });
}

function playDraw(delay?: number): SoundObject | undefined {
	return playSoundEffect('draw', { volume: 0.7, delay });
}

function playLoss(delay?: number): SoundObject | undefined {
	return playSoundEffect('loss', { volume: 0.7, delay });
}

function playLowtime(): SoundObject | undefined {
	return playSoundEffect('lowtime');
}

function playDrum(): SoundObject | undefined {
	const soundName = Math.random() > 0.5 ? 'drum1' : 'drum2';
	return playSoundEffect(soundName, { volume: 0.7 });
}

function playTick({ volume, offset }: { volume?: number, offset?: number } = {}): SoundObject | undefined {
	return playSoundEffect('tick', { volume, offset });
}

function playTicking({ volume, offset }: { volume?: number, offset?: number } = {}): SoundObject | undefined {
	return playSoundEffect('ticking', { volume, offset });
}

function playViola_c3({ volume }: { volume?: number } = {}): SoundObject | undefined {
	return playSoundEffect('viola_staccato_c3', { volume });
}

function playViolin_c4(): SoundObject | undefined {
	return playSoundEffect('violin_staccato_c4', { volume: 0.9 });
}

function playMarimba(): SoundObject | undefined {
	const audioName = Math.random() > 0.15 ? 'marimba_c2_soft' : 'marimba_c2';
	return playSoundEffect(audioName, { volume: 0.4 });
}

function playBase(): SoundObject | undefined {
	return playSoundEffect('base_staccato_c2', { volume: 0.8 });
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