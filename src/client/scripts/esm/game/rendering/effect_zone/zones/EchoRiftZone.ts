
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { VoronoiDistortionPass } from "../../../../webgl/post_processing/passes/VoronoiDistortionPass";


export class EchoRiftZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 5; // <-- UPDATE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	/** Post Processing Effect bending light through a crystalline voronoi distortion pattern structure. */
	private voronoiDistortionPass: VoronoiDistortionPass;


	// ============ State ============

	/** The next timestamp the voronoi distortion pass will update the time value, revealing a different pattern. */
	private nextCrackTime: number = Date.now();


	constructor(programManager: ProgramManager) {
		this.voronoiDistortionPass = new VoronoiDistortionPass(programManager);
	}


	public update(): void {
		
		// Update cracking of the voronoi distortion effect.

		// voronoiDistortionPass.time = 632663;
		// voronoiDistortionPass.time = Date.now() / 1000;
		// voronoiDistortionPass.time = Math.floor(performance.now() / 400) * 10;
		if (Date.now() > this.nextCrackTime) {
			this.voronoiDistortionPass.time = performance.now() / 10;
			const rand = Math.random() * Math.random(); // Bias towards smaller numbers
			this.nextCrackTime = Date.now() + 250 + rand * 3000;
		}
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.voronoiDistortionPass];
	}
}