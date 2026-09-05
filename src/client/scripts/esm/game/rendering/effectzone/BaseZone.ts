// src/client/scripts/esm/game/rendering/effectzone/BaseZone.ts

/**
 * The base every effect zone extends.
 *
 * Owns the ambient soundscape and its fades, and defaults a zone to no post-processing
 * passes. Subclasses supply the effect id, the per-frame update, and the shader uniforms.
 */

import type { UniformValue } from '../../../webgl/Renderable';
import type { PostProcessPass } from '../../../webgl/postprocessing/PostProcessPass';
import type { SoundscapePlayer } from '../../../audio/SoundscapePlayer';

export abstract class BaseZone {
	/** The unique integer id this effect zone gets. */
	abstract readonly effectType: number;

	/** This zone's ambient soundscape. Undefined for a silent zone. */
	protected ambience: SoundscapePlayer | undefined;

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
	}

	/** Fades out the ambience, then stops the track playing. */
	public fadeOutAmbience(transitionDurationMs: number): void {
		this.ambience?.fadeOut(transitionDurationMs);
	}
}
