
// src/client/scripts/esm/game/misc/gamesound.ts

/**
 * This script is in charge of storing our audio
 * spritesheet, and playing game sound effects.
 * It takes variables such as distances pieces moved
 * so it can deduce the correct sound play options when
 * calling {@link AudioManager.playAudio}.
 */

import type { EffectConfig } from "../../audio/AudioEffects.js";
import type { Coords } from "../../../../../shared/chess/util/coordutil.js";

import screenshake from "../rendering/screenshake.js";
import math from "../../../../../shared/util/math/math.js";
import WaterRipples from "../rendering/WaterRipples.js";
import bd, { BigDecimal } from "../../../../../shared/util/bigdecimal/bigdecimal.js";
import AudioManager, { SoundObject } from "../../audio/AudioManager.js";


// Constants --------------------------------------------------------------------------


/** The timestamps where each game sound effect starts and ends inside our sound spritesheet. */
const soundStamps = {
	gamestart: [0, 2.008],
	move: [2.009, 2.150],
	capture: [2.151,2.462],
	bell: [2.463,5.402],
	lowtime: [5.404, 5.985],
	win: [5.986, 7.994],
	draw: [7.995, 10.003],
	loss: [10.004, 12.012],
	drum1: [12.013, 16.012],
	drum2: [16.013, 19.262],
	tick: [19.263 , 25.012],
	ticking: [25.013, 36.357],
	viola_staccato_c3: [36.359, 38.357],
	violin_staccato_c4: [38.359, 40.357],
	marimba_c2: [40.359, 42.356],
	marimba_c2_soft: [42.357, 44.356],
	base_staccato_c2: [44.357, 46.354],
	ripple: [46.356, 50.354],
	glass_crack_1: [50.356, 50.760],
	glass_crack_2: [50.760, 51.848],
	glass_crack_3: [51.848, 52.621],
	glass_crack_4: [52.621, 53.222],
	glass_crack_5: [53.222, 53.627],
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

/** Config for the water droplet ripple effect for EXTREMELY large moves. */
const RIPPLE_CONFIG = {
	/**
	 * The minimum distance a piece needs to move for the water droplet ripple effect to trigger.
	 * At current settings, this starts at the Spectral Edge beginning.
	 */
	minDist: bd.FromBigInt(10n ** 120n), // 10^120 squares
	// minDist: bd.FromBigInt(20n), // FOR TESTING
	maxPlaybackRate: 1.18,
	minPlaybackRate: 1.0,
	/**
	 * How much slower the playback rate is, depending on how far you move.
	 * 0.002 yields .18 playback rate travel in e90
	 * At current settings, it stops decreasing at about e210, 30e after Iridescence zone begins.
	 */
	playbackRateReductionPerE: 0.002, // Default: 0.002
	/** The volume of the ripple sound effecet, as a multiplier to the move sound's volume. */
	volume: 0.8,
} as const;


/** Config for the screen shake effect for very large moves. */
const SHAKE_CONFIG = {
	/** The order of magnitude distance a piece needs to move for the screen shake to begin triggering. */
	minDist: 4, // 10,000 squares => trauma begins increasing from 0
	/**
	 * How much screen shake trauma is added per order of magnitude the piece moved.
	 * 0.012 yields 1.0 shake trauma at about 1e90
	 */
	traumaMultiplier: 0.012,
};

/** Config for playing premove sound effects. */
const PREMOVE_CONFIG = {
	/** Premove sounds are played faster so they sound more like a click. */
	playbackRate: 1.5,
	/** Premove sounds are slightly quieter. */
	volume: 0.5,
} as const;


// Initiation Variables --------------------------------------------------------------------------


/** The decoded buffer of the fetched game sound spritesheet. */
let spritesheetDecodedBuffer: AudioBuffer | undefined = undefined;


// State ------------------------------------------------------------------------------


/** Timestamp of the last played move sound. */
let timeLastMoveOrCaptureSound = 0;


// Spritesheet Buffer ----------------------------------------------------


// Fetch and decode the buffer of the sound spritesheet.
fetch('sounds/spritesheet/soundspritesheet.opus')
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
function playSoundEffect(soundName: SoundName, options: { volume?: number, delay?: number, offset?: number, reverbWetLevel?: number, reverbDuration?: number, playbackRate?: number, bypassDownsampler?: boolean } = {}): SoundObject | undefined {
	let { startTime, duration } = getSoundTimeSnippet(soundName);
	const { volume, delay, offset, reverbWetLevel, reverbDuration, playbackRate, bypassDownsampler } = options;

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

	return AudioManager.playAudio(spritesheetDecodedBuffer, { startTime, duration, volume, delay, playbackRate, effects, bypassDownsampler });
}

/**
 * Plays a piece move sound effect.
 * Automatically handles effects such as capture, reverb, bell, dampening, etc.
 * @param distanceMoved - How far the piece moved.
 * @param capture - Whether this move made a capture.
 * @param premove - Whether this move is a premove.
 * @param destination - Optional. The destination coordinates of the piece move, for ripple effects.
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

	if (destination && bd.compare(distanceMoved, RIPPLE_CONFIG.minDist) >= 0) {
		// Trigger water dropplet ripple effect
		const rippleVolume = volume * RIPPLE_CONFIG.volume;
		// Calculate playback rate based on distance moved
		const eDifference = bd.log10(distanceMoved) - bd.log10(RIPPLE_CONFIG.minDist);
		const ripplePlayrate = playbackRate * Math.max(RIPPLE_CONFIG.maxPlaybackRate - (eDifference * RIPPLE_CONFIG.playbackRateReductionPerE), RIPPLE_CONFIG.minPlaybackRate);
		// console.log("Ripple playrate:", ripplePlayrate);

		playSoundEffect('ripple', { volume: rippleVolume, delay: delaySecs, playbackRate: ripplePlayrate });
		WaterRipples.addRipple(destination);
		screenshake.trigger(0.25);
	} else {
		// Apply screen shake for very large moves
		const rawTrauma = (bd.log10(distanceMoved) - SHAKE_CONFIG.minDist) * SHAKE_CONFIG.traumaMultiplier;
		const trauma = math.clamp(rawTrauma, 0, 1);
		if (trauma > 0) screenshake.trigger(trauma); // Delay slightly so it syncs better with the audio

		if (bd.compare(distanceMoved, BELL_CONFIG.minDist) >= 0) {
			// Move is large enough to play the bell sound too
			const bellVolume = volume * BELL_CONFIG.volume;
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
	return playSoundEffect('gamestart', { volume: 0.4, bypassDownsampler: true });
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

function playGlassCrack(): SoundObject | undefined {
	const rand = Math.random();
	const soundName: SoundName = rand < 0.2 ? 'glass_crack_1'
		: rand < 0.4 ? 'glass_crack_2'
		: rand < 0.6 ? 'glass_crack_3'
		: rand < 0.8 ? 'glass_crack_4'
		: 'glass_crack_5';
	const PLAYRATE_BASE_OFFSET = -0.2;
	const PLAYRATE_VARIATION = 0.07;
	const playrate = 1 + (Math.random() * 2 - 1) * PLAYRATE_VARIATION + PLAYRATE_BASE_OFFSET;
	return playSoundEffect(soundName, { volume: 0.04, playbackRate: playrate, reverbWetLevel: 4.0, reverbDuration: 0.8, bypassDownsampler: true });
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
	playBase,
	playGlassCrack,
};