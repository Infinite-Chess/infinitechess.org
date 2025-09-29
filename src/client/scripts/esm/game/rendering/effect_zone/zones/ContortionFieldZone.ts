
// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { SineWavePass } from "../../../../webgl/post_processing/passes/SineWavePass";


export class ContortionFieldZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 6; // <-- UPDATE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	/** Post Processing Effect creating heat waves. */
	private sineWavePass: SineWavePass;


	/** How fast the sine waves oscillate. */
	private oscillationSpeed: number = 1.0;

	/** How fast the sine waves rotates, in degrees per second. */
	private rotationSpeed: number = 3.0;


	constructor(programManager: ProgramManager) {
		this.sineWavePass = new SineWavePass(programManager);
	}


	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime(); // Seconds

		this.sineWavePass.time = Date.now() / 1000 * this.oscillationSpeed; // Default: 500 (strength 0.04)
		this.sineWavePass.angle += this.rotationSpeed * deltaTime;
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.sineWavePass];
	}
}