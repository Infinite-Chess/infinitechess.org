
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
}