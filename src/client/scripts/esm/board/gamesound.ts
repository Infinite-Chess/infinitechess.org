// src/client/scripts/esm/board/gamesound.ts

/**
 * Manages individual game sound files: lazy-fetches and caches each AudioBuffer
 * on first play, then plays it via AudioManager.
 */

import type { SoundObject } from '../audio/AudioManager.js';
import type { EffectConfig } from '../audio/AudioEffects.js';

import AudioManager from '../audio/AudioManager.js';

// Types --------------------------------------------------------------------------

type SoundName =
	| 'move' | 'capture' | 'bell' | 'ripple_a3'
	| 'viola_staccato_c3' | 'marimba_c2' | 'marimba_c2_soft' | 'base_staccato_c2'
	| 'notify' | 'low_time'
	| 'glass_crack_1' | 'glass_crack_2' | 'glass_crack_3' | 'glass_crack_4' | 'glass_crack_5'; // prettier-ignore

// Cache --------------------------------------------------------------------------

const audioCache = new Map<SoundName, AudioBuffer>();

async function getBuffer(soundName: SoundName): Promise<AudioBuffer | undefined> {
	const cached = audioCache.get(soundName);
	if (cached) return cached;
	try {
		const response = await fetch(`/sounds/${soundName}.opus`);
		// Only read the body if OK: a non-OK response (e.g. a 429, or an HTML error page)
		// isn't valid audio, so skip the needless decode and fail explicitly instead.
		if (!response.ok) throw new Error(`Fetch returned status ${response.status}.`);
		const arrayBuffer = await response.arrayBuffer();
		const decoded = await AudioManager.getContext().decodeAudioData(arrayBuffer);
		audioCache.set(soundName, decoded);
		return decoded;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Failed to load sound "${soundName}": ${message}`);
		return undefined;
	}
}

/** Pre-fetches and caches a sound without playing it. */
async function preload(soundName: SoundName): Promise<void> {
	await getBuffer(soundName);
	// console.log(`Preloaded sound: ${soundName}`);
}

// Playing Sounds --------------------------------------------------------------------------

/**
 * Plays a sound by name, fetching and caching its buffer on first use.
 * @param soundName - The name of the sound to play.
 * @param options - Optional playback parameters.
 */
async function playSoundEffect(
	soundName: SoundName,
	options: {
		volume?: number;
		delay?: number;
		/** Reverb duration in seconds. */
		reverbDuration?: number;
		/** The strength of the reverb level. */
		reverbWetLevel?: number;
		playbackRate?: number;
		bypassDownsampler?: boolean;
	} = {},
): Promise<SoundObject | undefined> {
	if (!audioCache.has(soundName)) {
		console.warn(`Sound "${soundName}" needs to be preloaded.`); // Don't play sound if it would inquire a delay to fetch
		return;
	}
	const buffer = await getBuffer(soundName);
	if (!buffer) return; // Sound failed to load

	const { volume, delay, reverbWetLevel, reverbDuration, playbackRate, bypassDownsampler } =
		options;

	// Add reverb effect if specified
	const effects: EffectConfig[] = [];
	if (reverbWetLevel && reverbDuration)
		effects.push({
			type: 'reverb',
			durationSecs: reverbDuration,
			dryLevel: 1,
			wetLevel: reverbWetLevel,
		});

	return AudioManager.playAudio(buffer, { volume, delay, playbackRate, effects, bypassDownsampler }); // prettier-ignore
}

// Named Play Functions --------------------------------------------------------------------------

function playViola_c3({ volume }: { volume?: number } = {}): void {
	playSoundEffect('viola_staccato_c3', { volume });
}

function playMarimba(): void {
	const audioName = Math.random() > 0.15 ? 'marimba_c2_soft' : 'marimba_c2';
	playSoundEffect(audioName, { volume: 0.4 });
}

function playBase({ playbackRate }: { playbackRate?: number } = {}): void {
	playSoundEffect('base_staccato_c2', { volume: 0.8, playbackRate });
}

function playNotify(includeReverb: boolean): Promise<SoundObject | undefined> {
	const options = includeReverb ? { reverbDuration: 1.5, reverbWetLevel: 0.7 } : {};
	return playSoundEffect('notify', options);
}

/**
 * Plays the notify sound, resolving only once it has finished, so a hard-navigate
 * that follows can't cut it off. No reverb — it makes us wait too long.
 */
async function playNotifyToCompletion(): Promise<void> {
	const sound = await playNotify(false);
	if (sound) await sound.whenEnded;
}

function playLowtime(): void {
	playSoundEffect('low_time');
}

function playGlassCrack(): void {
	const rand = Math.random();
	const soundName: SoundName = rand < 0.2 ? 'glass_crack_1'
							   : rand < 0.4 ? 'glass_crack_2'
							   : rand < 0.6 ? 'glass_crack_3'
							   : rand < 0.8 ? 'glass_crack_4'
							   				: 'glass_crack_5'; // prettier-ignore
	const PLAYRATE_BASE_OFFSET = -0.2;
	const PLAYRATE_VARIATION = 0.07;
	const playrate = 1 + (Math.random() * 2 - 1) * PLAYRATE_VARIATION + PLAYRATE_BASE_OFFSET;
	playSoundEffect(soundName, {
		volume: 0.04,
		playbackRate: playrate,
		reverbWetLevel: 4.0,
		reverbDuration: 0.8,
		bypassDownsampler: true,
	});
}

// Exports --------------------------------------------------------------------------

export default {
	// Cache
	preload,
	// Playing Sounds
	playSoundEffect,
	// Named Play Functions
	playViola_c3,
	playMarimba,
	playBase,
	playNotify,
	playNotifyToCompletion,
	playLowtime,
	playGlassCrack,
};
