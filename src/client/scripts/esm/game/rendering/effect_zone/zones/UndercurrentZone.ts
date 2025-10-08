
/**
 * This is the 1st zone you encounter moving away from the origin.
 * 
 * It has NO visual effect, but it does introduce the first ambience.
 */

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { Zone } from "../EffectZoneManager";


export class UndercurrentZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;


	constructor() {
		// Load the ambience...
	}


	public update(): void {
		// No dynamic state to update for a pass-through zone.
	}
    
	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [];
	}

	public fadeInAmbience(transitionDurationMillis: number): void {
        
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
        
	}
}