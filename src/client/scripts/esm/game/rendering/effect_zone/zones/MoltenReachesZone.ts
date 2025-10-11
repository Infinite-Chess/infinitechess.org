
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";


export class MoltenReachesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 4;

	private colorGradePass: ColorGradePass;

	/** Post processing effect creating heat waves. */
	private heatWavePass: HeatWavePass | undefined = undefined;


	/** The speed of the moving heat waves. Default: 0.5 (strength 0.04) */
	private speed: number = 1.0;


	constructor(programManager: ProgramManager, noise: Promise<WebGLTexture>) {
		noise.then(texture => this.heatWavePass = new HeatWavePass(programManager, texture));

		this.colorGradePass = new ColorGradePass(programManager);
		// this.colorGradePass.saturation = 1.2;
		// this.colorGradePass.gamma = 1.2;
		// this.colorGradePass.tint = [1.0, 0.9, 0.9];
		// this.colorGradePass.brightness = -0.1;
	}


	public update(): void {
		if (this.heatWavePass) this.heatWavePass.time = performance.now() / 1000 * this.speed;

		// FUTURE: Update animation of heat pockets?
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		const activePasses: PostProcessPass[] = [this.colorGradePass];
		if (this.heatWavePass) activePasses.push(this.heatWavePass);
		return activePasses;
	}
    
	public fadeInAmbience(transitionDurationMillis: number): void {

	}

	public fadeOutAmbience(transitionDurationMillis: number): void {

	}
}