// src/client/scripts/esm/game/rendering/effectzone/BaseZone.ts

/**
 * The base every effect zone extends.
 *
 * Owns the ambient soundscape and its fades, along with the downsampler's for a zone that
 * downsamples every sound, and defaults a zone to no post-processing passes. Subclasses
 * supply the effect id, the per-frame update, and the shader uniforms.
 */

import type { UniformValue } from '../../../webgl/Renderable.js';
import type { PostProcessPass } from '../../../webgl/postprocessing/PostProcessPass.js';
import type { SoundscapePlayer } from '../../../audio/SoundscapePlayer.js';

import AudioManager from '../../../audio/AudioManager.js';

export abstract class BaseZone {
	/** The unique integer id this effect zone gets. */
	abstract readonly effectType: number;

	/** This zone's ambient soundscape. Undefined for a silent zone. */
	protected ambience: SoundscapePlayer | undefined;

	/** Whether every sound is downsampled while this zone's ambience plays. */
	protected readonly downsamplesSound: boolean = false;

	/** Dynamically updates the zone effect. */
	abstract update(): void;

	/** Returns the uniforms needed to send to the gpu. */
	abstract getUniforms(): Record<string, UniformValue>;

	/** Returns the current post processing pass effects for this zone. Override only if it has any. */
	public getPasses(): PostProcessPass[] {
		return [];
	}

	/** Fades in the ambience. */
	public fadeInAmbience(transitionDurationMs: number): void {
		this.ambience?.fadeIn(transitionDurationMs);
		if (this.downsamplesSound) AudioManager.fadeInDownsampler(transitionDurationMs);
	}

	/** Fades out the ambience, then stops the track playing. */
	public fadeOutAmbience(transitionDurationMs: number): void {
		this.ambience?.fadeOut(transitionDurationMs);
		if (this.downsamplesSound) AudioManager.fadeOutDownsampler(transitionDurationMs);
	}
}
