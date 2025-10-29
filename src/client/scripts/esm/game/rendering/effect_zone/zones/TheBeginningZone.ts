
// src/client/scripts/esm/game/rendering/effect_zone/zones/TheBeginningZone.ts

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { Zone } from "../EffectZoneManager";


export class TheBeginningZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 0;


	public update(): void {
		// No dynamic state to update for a pass-through zone.
	}
	
	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [];
	}

	// eslint-disable-next-line no-unused-vars
	public fadeInAmbience(transitionDurationMillis: number): void {

	}

	// eslint-disable-next-line no-unused-vars
	public fadeOutAmbience(transitionDurationMillis: number): void {

	}
}