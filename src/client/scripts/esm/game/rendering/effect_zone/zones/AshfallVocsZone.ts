
// src/client/scripts/esm/game/rendering/effect_zone/zones/AshfallVocsZone.ts

import AudioManager from "../../../../audio/AudioManager";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";
import { VignettePass } from "../../../../webgl/post_processing/passes/VignettePass";
import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";


export class AshfallVocsZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 9;

	private colorGradePass: ColorGradePass;

	/** Post processing vignette effect. */
	private vignettePass: VignettePass;
	
	/** Post processing effect creating heat waves. */
	private heatWavePass: HeatWavePass | undefined = undefined;


	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;
	
	/** The speed of the moving heat waves. Default: 0.5 (strength 0.04) */
	private heatWaveSpeed: number = 2.0;

	
	/** The base brightness level around which the brightness will periodically go BELOW. */
	private baseBrightness: number = 0;
	/** How much the brightness will vary above and below the base brightness. */
	private brightnessVariation: number = 0.3;
	/** The higher this is, the less percentage of the period the brightness actually lowers, as the change is capped at 0. MUST BE < brightnessVariation! */
	private brightnessYOffset: number = 0.1;
	/** The period of the varying brightness, in seconds. */
	private brightnessPeriod: number = 3.5;

	/** The base vignette effect intensity. */
	private baseVignetteIntensity = 0.6;
	/** The vignette intensity variation. */
	private variationVignetteIntensity = 0.2;
	/** The vignette oscillation period, in seconds. */
	private vignettePeriod = 5;


	constructor(programManager: ProgramManager, noise: Promise<WebGLTexture>) {
		noise.then(texture => this.heatWavePass = new HeatWavePass(programManager, texture));

		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 2;
		this.colorGradePass.contrast = 1.4;
		this.colorGradePass.tint = [1.0, 0.5, 0.4];

		this.vignettePass = new VignettePass(programManager);
		this.vignettePass.radius = 0.3;
		this.vignettePass.softness = 0.5;


		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.36,
			layers: [
				...UndercurrentSoundscape.config.layers,
				{
					volume: {
						base: 0.005,
						lfo: {
							wave: "perlin",
							rate: 0.22,
							depth: 0.0003
						}
					},
					source: {
						type: "noise"
					},
					filters: [
						{
							type: "bandpass",
							frequency: {
								base: 10000
							},
							Q: {
								base: 0.9601
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
		this.ambience = new SoundscapePlayer(noiseConfig);
	}


	public update(): void {
		if (this.heatWavePass) this.heatWavePass.time = performance.now() / 1000 * this.heatWaveSpeed;

		// Periodically lower the brightness, to make it appear as if the biome is breathing.
		// Capped at 0 so half the time the brightness doesn't change, and the other 
		const currentVariation = Math.min(Math.sin(performance.now() / 1000 / this.brightnessPeriod * Math.PI * 2) * this.brightnessVariation + this.brightnessYOffset, 0);
		const currentBrightness = this.baseBrightness + currentVariation;
		this.colorGradePass.brightness = currentBrightness;

		// Vary the vignette intensity periodically as well.
		const currentVignetteVariation = Math.sin(performance.now() / 1000 / this.vignettePeriod * Math.PI * 2) * this.variationVignetteIntensity;
		this.vignettePass.intensity = this.baseVignetteIntensity + currentVignetteVariation;
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		const passes: PostProcessPass[] = [this.colorGradePass, this.vignettePass];
		if (this.heatWavePass) passes.push(this.heatWavePass);
		return passes;
	}
	
	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}