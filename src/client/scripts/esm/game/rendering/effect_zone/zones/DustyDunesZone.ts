import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import loadbalancer from "../../../misc/loadbalancer";
import { Zone } from "../EffectZoneManager";


export class DustyDunesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 1;

	private colorGradePass: ColorGradePass;


	/** The strength of the effect. */
	private strength: number = 0.35; // Default: 0.35

	/** The vector offset in radians each scroll vector is from each other. */
	private scrollDirectionsOffset: number = 0.6;

	/** How much faster one scroll speed is greater than the other. */
	private scrollSpeedOffset: number = 1.2;

	/** How many times the noise texture should tile the screen. */
	private noiseTiling: number = 1.5;

	/** The average wind speed. */
	private windSpeed: number = 0.6;
	
	/** The speed at which the wind direction rotates, in radians per second. */
	private windRotationSpeed: number = 0.0025;


	// ============ State ============

	/** The wind direction in radians. 0 is to the right. */
	private windDirection: number = Math.random() * Math.PI * 2;

	/** The direction the wind is rotating. Clockwise or counter-clockwise. */
	private windRotationParity: -1 | 1 = Math.random() < 0.5 ? -1 : 1;


	constructor(programManager: ProgramManager) {
		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 0.7;
	}


	public update(): void {
		// Animate the wind direction over time.
		const deltaTime = loadbalancer.getDeltaTime();
		this.windDirection += this.windRotationSpeed * this.windRotationParity * deltaTime;
		if (this.windDirection > Math.PI * 2) this.windDirection -= Math.PI * 2;

		// TESING: Update color grade uniforms here if needed.
		// this.colorGradePass.hueOffset += 0.1 * deltaTime;
	}

	public getUniforms(): Record<string, any> {
		// The average wind direction is windDirection.
		// Calculate the vectors for the two scroll speeds.
		const angle1 = this.windDirection - (this.scrollDirectionsOffset / 2);
		const angle2 = this.windDirection + (this.scrollDirectionsOffset / 2);

		// Break up the scroll speeds into x and y components.
		const scrollSpeed1 = [
			Math.cos(angle1) * this.windSpeed,
			Math.sin(angle1) * this.windSpeed
		];
		const scrollSpeed2 = [
			Math.cos(angle2) * this.windSpeed * this.scrollSpeedOffset,
			Math.sin(angle2) * this.windSpeed * this.scrollSpeedOffset
		];

		return {
			u1_strength: this.strength,
			u1_scrollSpeed1: scrollSpeed1,
			u1_scrollSpeed2: scrollSpeed2,
			u1_noiseTiling: this.noiseTiling,
		};
	}

	public getPasses(): PostProcessPass[] {
		return [this.colorGradePass];
	}
}