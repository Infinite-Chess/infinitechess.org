
// src/client/scripts/esm/game/rendering/effect_zone/zones/SearingDunesZone.ts

// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";


export class SearingDunesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 4;

	private colorGradePass: ColorGradePass;

	/** Post processing effect creating heat waves. */
	private heatWavePass: HeatWavePass | undefined = undefined;


	/** The speed of the moving heat waves. Default: 0.5 (strength 0.04) */
	private heatWaveSpeed: number = 1.0;


	/** The sand color for the wind. */
	private sandColor: [number, number, number] = [1.0, 0.35, 0.18]; // warm red-orange sand

	/** The strength/opacity of the sandy wind effect. */
	private windStrength: number = 0.25;

	/** How many times the noise texture should tile the screen. */
	private noiseTiling: number = 1.25;

	/** The average wind speed. */
	private windSpeed: number = 0.45;

	/** How much faster one scroll speed is greater than the other. */
	private windSpeedsOffset: number = 1.2;

	/** The vector offset in radians each scroll vector is from each other. */
	private windDirectionsOffset: number = 0.6;

	/** The direction the wind is rotating. Clockwise or counter-clockwise. */
	private windRotationParity: -1 | 1 = Math.random() < 0.5 ? -1 : 1;

	/** The speed at which the wind direction rotates, in radians per second. Slower than DustyWastes. */
	private windRotationSpeed: number = 0.0035;


	// ============ State ============

	/** The wind direction in radians. 0 is to the right. */
	private windDirection: number = Math.random() * Math.PI * 2;

	/** The accumulated UV offset for the first noise layer. Wrapped to [0,1]. */
	private uvOffset1: [number, number] = [0, 0];

	/** The accumulated UV offset for the second noise layer. Wrapped to [0,1]. */
	private uvOffset2: [number, number] = [0, 0];


	constructor(programManager: ProgramManager, noise: Promise<WebGLTexture>) {
		noise.then(texture => this.heatWavePass = new HeatWavePass(programManager, texture));

		this.colorGradePass = new ColorGradePass(programManager);
		// this.colorGradePass.saturation = 1.2;
		// this.colorGradePass.gamma = 1.2;
		// this.colorGradePass.tint = [1.0, 0.9, 0.9];
		// this.colorGradePass.brightness = -0.1;

		// Load the ambience...
	}

	/** Responsible for calculating the exact UV offsets of the noise texture layers each frame. */
	public update(): void {
		if (this.heatWavePass) this.heatWavePass.time = performance.now() / 1000 * this.heatWaveSpeed;

		const deltaTime = loadbalancer.getDeltaTime();

		// Animate the wind direction.
		this.windDirection += this.windRotationSpeed * this.windRotationParity * deltaTime;
		if (this.windDirection > Math.PI * 2) this.windDirection -= Math.PI * 2;
		else if (this.windDirection < 0) this.windDirection += Math.PI * 2;

		// Calculate the instantaneous velocity vectors for this frame.
		const angle1 = this.windDirection - (this.windDirectionsOffset / 2);
		const angle2 = this.windDirection + (this.windDirectionsOffset / 2);

		const velocity1 = [
			Math.cos(angle1) * this.windSpeed,
			Math.sin(angle1) * this.windSpeed
		];
		const velocity2 = [
			Math.cos(angle2) * this.windSpeed * this.windSpeedsOffset,
			Math.sin(angle2) * this.windSpeed * this.windSpeedsOffset
		];

		// Integrate: Add the displacement for this frame (velocity * deltaTime) to the total offset.
		this.uvOffset1[0] += (velocity1[0]! * deltaTime) % 1;
		this.uvOffset1[1] += (velocity1[1]! * deltaTime) % 1;
		this.uvOffset2[0] += (velocity2[0]! * deltaTime) % 1;
		this.uvOffset2[1] += (velocity2[1]! * deltaTime) % 1;
	}

	public getUniforms(): Record<string, any> {
		return {
			u4_strength: this.windStrength,
			u4_noiseTiling: this.noiseTiling,
			u4_uvOffset1: this.uvOffset1,
			u4_uvOffset2: this.uvOffset2,
			u4_sandColor: this.sandColor,
		};
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