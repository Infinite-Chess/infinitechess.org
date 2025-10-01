
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";


export class CrackedBarrensZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 3;


	// constructor(programManager: ProgramManager) {

	// }


	public update(): void {
		// FUTURE: Animate slow evolution of cracked pockets (Voronoi Pattern).
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