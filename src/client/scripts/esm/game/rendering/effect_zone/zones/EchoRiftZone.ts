
// src/client/scripts/esm/game/rendering/effect_zone/zones/EchoRiftZone.ts

import PerlinNoise from "../../../../util/PerlinNoise";
import AudioManager from "../../../../audio/AudioManager";
import gamesound from "../../../misc/gamesound";
import preferences from "../../../../components/header/preferences";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { VoronoiDistortionPass } from "../../../../webgl/post_processing/passes/VoronoiDistortionPass";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";


export class EchoRiftZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 8;

	private colorGradePass: ColorGradePass;

	/** Post Processing Effect bending light through a crystalline voronoi distortion pattern structure. */
	private voronoiDistortionPass: VoronoiDistortionPass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	/** A 1D Perlin noise generator for randomizing color grade properties. */
	private noiseGenerator: (_t: number) => number;
	/** How "zoomed in" the Perlin noise is. Higher values = smoother/slower noise. */
	private noiseZoom: number = 3000;

	
	/** The base brightness level around which the brightness will vary. */
	private baseBrightness: number = -0.39;
	/** How much the brightness will vary above and below the base brightness. */
	private brightnessVariation: number = 0.07;


	// ============ State ============

	/** The next timestamp the voronoi distortion pass will update the time value, revealing a different pattern. */
	private nextCrackTime: number = Date.now();

	private baseMillisBetweenCracks: number = 400;
	private maxMillisBetweenCracks: number = 4000;


	constructor(programManager: ProgramManager) {
		this.voronoiDistortionPass = new VoronoiDistortionPass(programManager);

		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 0;
		this.colorGradePass.contrast = 0.3;

		this.noiseGenerator = PerlinNoise.create1DNoiseGenerator(30);

		// Load the ambience...

		const soundConfig: SoundscapeConfig = {
			masterVolume: 1.0,
			layers: [
				{
					volume: {
						base: 0.7,
						lfo: {
							wave: "perlin",
							rate: 1.13,
							depth: 0.5
						}
					},
					source: {
						type: "noise"
					},
					filters: [
						{
							type: "lowpass",
							frequency: {
								base: 136
							},
							Q: {
								base: 1.0001
							},
							gain: {
								base: 0
							}
						},
						{
							type: "lowpass",
							frequency: {
								base: 139
							},
							Q: {
								base: 1.0001
							},
							gain: {
								base: 0
							}
						}
					]
				}
			]
		};

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(soundConfig);
	}


	public update(): void {
		
		// Update cracking of the voronoi distortion effect.

		// voronoiDistortionPass.time = 632663;
		// voronoiDistortionPass.time = Date.now() / 1000;
		// voronoiDistortionPass.time = Math.floor(performance.now() / 400) * 10;
		if (Date.now() > this.nextCrackTime) {
			this.voronoiDistortionPass.time = performance.now() / 10;
			this.nextCrackTime = Date.now() + this.baseMillisBetweenCracks + Math.random() * this.maxMillisBetweenCracks;
			if (preferences.getAmbienceEnabled()) gamesound.playGlassCrack();
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
		this.ambience.fadeIn(transitionDurationMillis);
		AudioManager.fadeInDownsampler(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
		AudioManager.fadeOutDownsampler(transitionDurationMillis);
	}
}