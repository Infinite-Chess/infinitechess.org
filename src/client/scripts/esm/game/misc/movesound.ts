// src/client/scripts/esm/game/misc/movesound.ts

/**
 * Handles the game-specific logic for move sound effects: calculating reverb,
 * dampening, bell, ripple, and screen-shake based on move distance, then
 * delegating playback to gamesound.
 */

import type { Coords } from '../../../../../shared/chess/util/coordutil.js';

import bd, { BigDecimal } from '@naviary/bigdecimal';

import math from '../../../../../shared/util/math/math.js';

import gamesound from './gamesound.js';
import screenshake from '../rendering/screenshake.js';
import WaterRipples from '../rendering/WaterRipples.js';

// Move Configs --------------------------------------------------------------------------

/** Config for successive, or rapidly played move sounds. */
const SUCCESSIVE_MOVES_CONFIG = {
	/**
	 * If move sounds are played within this time, they get delayed until this amount time has passed, in milliseconds.
	 * This is to prevent sounds from playing at the exact same time, such as the king & rook while castling.
	 */
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
	minDist: bd.fromBigInt(1_000_000n),
	/** The volume of the bell gongs, as a multiplier to the move sound's volume. */
	volume: 0.6,
} as const;

/** Config for the water droplet ripple effect for EXTREMELY large moves. */
const RIPPLE_CONFIG = {
	/**
	 * The minimum distance a piece needs to move for the water droplet ripple effect to trigger.
	 * At current settings, this starts at the Spectral Edge beginning.
	 */
	minDist: bd.fromBigInt(10n ** 120n), // 10^120 squares
	// minDist: bd.fromBigInt(20n), // FOR TESTING
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

// State --------------------------------------------------------------------------

/** Timestamp of the last played move sound. */
let timeLastMoveOrCaptureSound = 0;

// Functions --------------------------------------------------------------------------

/**
 * Plays a piece move sound effect.
 * Automatically handles effects such as capture, reverb, bell, dampening, etc.
 * @param distanceMoved - How far the piece moved.
 * @param capture - Whether this move made a capture.
 * @param premove - Whether this move is a premove.
 * @param destination - Optional. The destination coordinates of the piece move, for ripple effects.
 */
function playMove(
	distanceMoved: BigDecimal,
	capture: boolean,
	premove: boolean,
	destination?: Coords,
): void {
	// Update the time since the last move sound was played
	const now = Date.now();
	const timeSinceLastMoveSoundPlayed = now - timeLastMoveOrCaptureSound;
	timeLastMoveOrCaptureSound = now;

	const soundEffectName = capture ? 'capture' : 'move';

	// Determine if we should add delay (sounds played at same time, such as the king & rook while castling)
	const delaySecs =
		Math.max(0, SUCCESSIVE_MOVES_CONFIG.gap - timeSinceLastMoveSoundPlayed) / 1000;

	// Determine if we should dampen the sound (sounds played successively, close together)
	const shouldDampen = timeSinceLastMoveSoundPlayed < SUCCESSIVE_MOVES_CONFIG.threshold;
	const successiveDampener = shouldDampen ? SUCCESSIVE_MOVES_CONFIG.dampener : 1; // Successively played moves are quieter
	const premoveDampener = premove ? PREMOVE_CONFIG.volume : 1; // Premoves are slightly quieter
	const dampener = successiveDampener * premoveDampener; // Total dampener
	const volume = 1 * dampener;

	const playbackRate = premove ? PREMOVE_CONFIG.playbackRate : 1; // Premove moves are played faster, so they sound more like a click.

	const { reverbWetLevel, reverbDuration } = calculateReverb(distanceMoved);

	gamesound.playSoundEffect(soundEffectName, {
		volume,
		reverbWetLevel,
		reverbDuration,
		delay: delaySecs,
		playbackRate,
	});

	if (destination && bd.compare(distanceMoved, RIPPLE_CONFIG.minDist) >= 0) {
		// Trigger water dropplet ripple effect
		const rippleVolume = volume * RIPPLE_CONFIG.volume;
		// Calculate playback rate based on distance moved
		const eDifference = bd.log10(distanceMoved) - bd.log10(RIPPLE_CONFIG.minDist);
		const ripplePlayrate =
			playbackRate *
			Math.max(
				RIPPLE_CONFIG.maxPlaybackRate -
					eDifference * RIPPLE_CONFIG.playbackRateReductionPerE,
				RIPPLE_CONFIG.minPlaybackRate,
			);
		// console.log("Ripple playrate:", ripplePlayrate);

		gamesound.playSoundEffect('ripple_a3', {
			volume: rippleVolume,
			delay: delaySecs,
			playbackRate: ripplePlayrate,
		});
		WaterRipples.addRipple(destination);
		screenshake.trigger(0.25);
	} else {
		// Apply screen shake for very large moves
		const rawTrauma =
			(bd.log10(distanceMoved) - SHAKE_CONFIG.minDist) * SHAKE_CONFIG.traumaMultiplier;
		const trauma = math.clamp(rawTrauma, 0, 1);
		if (trauma > 0) screenshake.trigger(trauma);

		if (bd.compare(distanceMoved, BELL_CONFIG.minDist) >= 0) {
			// Move is large enough to play the bell sound too
			const bellVolume = volume * BELL_CONFIG.volume;
			gamesound.playSoundEffect('bell', {
				volume: bellVolume,
				delay: delaySecs,
				playbackRate,
			});
		}
	}
}

/** Takes the distance a piece moved, and returns the applicable reverb wet level and duration. */
function calculateReverb(
	distanceMoved: BigDecimal,
):
	| { reverbWetLevel: number; reverbDuration: number }
	| { reverbWetLevel: undefined; reverbDuration: undefined } {
	const distanceMovedNum = bd.toNumber(distanceMoved);
	const x =
		(distanceMovedNum - REVERB_CONFIG.minDist) /
		(REVERB_CONFIG.maxDist - REVERB_CONFIG.minDist); // 0-1
	if (x <= 0) return { reverbWetLevel: undefined, reverbDuration: undefined };
	else if (x >= 1)
		return {
			reverbWetLevel: REVERB_CONFIG.maxWetLevel,
			reverbDuration: REVERB_CONFIG.duration,
		};

	return {
		reverbWetLevel: REVERB_CONFIG.maxWetLevel * x, // No easing applied, for now
		reverbDuration: REVERB_CONFIG.duration,
	};
}

// Exports --------------------------------------------------------------------------

export default { playMove };
