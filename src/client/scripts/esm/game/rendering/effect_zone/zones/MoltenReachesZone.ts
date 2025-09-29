
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";


export class MoltenReachesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 4; // <-- UPDATE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	/** Post processing effect creating heat waves. */
	private heatWavePass: HeatWavePass;


	/** The speed of the moving heat waves. Default: 0.5 (strength 0.04) */
	private speed: number = 0.5;


	constructor(programManager: ProgramManager, noise: WebGLTexture) {
		this.heatWavePass = new HeatWavePass(programManager, noise);
	}


	public update(): void {
		this.heatWavePass.time = performance.now() / 1000 * this.speed;

		// FUTURE: Update animation of heat pockets?
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.heatWavePass];
	}
}