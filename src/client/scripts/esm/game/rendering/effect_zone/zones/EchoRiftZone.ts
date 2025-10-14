
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { VoronoiDistortionPass } from "../../../../webgl/post_processing/passes/VoronoiDistortionPass";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import PerlinNoise from "../../../../util/PerlinNoise";


export class EchoRiftZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 5; // <-- UPDATE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	private colorGradePass: ColorGradePass;

	/** Post Processing Effect bending light through a crystalline voronoi distortion pattern structure. */
	private voronoiDistortionPass: VoronoiDistortionPass;

	/** A 1D Perlin noise generator for randomizing color grade properties. */
	private noiseGenerator: (t: number) => number;
	/** How "zoomed in" the Perlin noise is. Higher values = smoother/slower noise. */
	private noiseZoom: number = 3000;

	
	/** The base brightness level around which the brightness will vary. */
	private baseBrightness: number = -0.43;
	/** How much the brightness will vary above and below the base brightness. */
	private brightnessVariation: number = 0.03;


	// ============ State ============

	/** The next timestamp the voronoi distortion pass will update the time value, revealing a different pattern. */
	private nextCrackTime: number = Date.now();

	private baseMillisBetweenCracks: number = 400;
	private maxMillisBetweenCracks: number = 4000;


	constructor(programManager: ProgramManager) {
		this.voronoiDistortionPass = new VoronoiDistortionPass(programManager);

		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 0;
		this.colorGradePass.contrast = 0.2;

		this.noiseGenerator = PerlinNoise.create1DNoiseGenerator(30);
	}


	public update(): void {
		
		// Update cracking of the voronoi distortion effect.

		// voronoiDistortionPass.time = 632663;
		// voronoiDistortionPass.time = Date.now() / 1000;
		// voronoiDistortionPass.time = Math.floor(performance.now() / 400) * 10;
		if (Date.now() > this.nextCrackTime) {
			this.voronoiDistortionPass.time = performance.now() / 10;
			this.nextCrackTime = Date.now() + this.baseMillisBetweenCracks + Math.random() * this.maxMillisBetweenCracks;
		}

		// Randomize the brightness
		const noiseValue = this.noiseGenerator(performance.now() / this.noiseZoom);
		this.colorGradePass.brightness = this.baseBrightness + noiseValue * this.brightnessVariation;
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.voronoiDistortionPass, this.colorGradePass];
		// return [this.colorGradePass];
	}
    
	public fadeInAmbience(transitionDurationMillis: number): void {

	}

	public fadeOutAmbience(transitionDurationMillis: number): void {

	}
}