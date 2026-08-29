// src/client/scripts/esm/game/rendering/effect_zone/Zone.ts

import type { PostProcessPass } from '../../../webgl/postprocessing/PostProcessPass';

/**
 * A constructed Zone, with methods for updating, obtaining
 * relevant uniforms, and obtaining post-process passes.
 */
export interface Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number;
	/** Dynamically updates the zone effect. */
	readonly update: () => void;
	/** Returns the uniforms needed to send to the gpu. */
	readonly getUniforms: () => Record<string, any>;
	/** Returns the current post processing pass effects for this zone. */
	readonly getPasses: () => PostProcessPass[];
	/** Fades in the ambience. */
	readonly fadeInAmbience: (transitionDurationMs: number) => void;
	/** Fades out the ambience, then stops the track playing. */
	readonly fadeOutAmbience: (transitionDurationMs: number) => void;
}
