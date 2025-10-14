
// src/client/scripts/esm/game/rendering/effect_zone/zones/SearingDunesZone.ts

// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { HeatWavePass } from "../../../../webgl/post_processing/passes/HeatWavePass";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";
import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";


export class SearingDunesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 4;

	private colorGradePass: ColorGradePass;

	/** Post processing effect creating heat waves. */
	private heatWavePass: HeatWavePass | undefined = undefined;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;


	/** The speed of the moving heat waves. Default: 0.5 (strength 0.04) */
	private heatWaveSpeed: number = 2.0;


	constructor(programManager: ProgramManager, noise: Promise<WebGLTexture>) {
		noise.then(texture => this.heatWavePass = new HeatWavePass(programManager, texture));

		this.colorGradePass = new ColorGradePass(programManager);
		// this.colorGradePass.tint = [1.0, 0.9, 0.9];

		// Load the ambience...

		// const noiseConfig: SoundscapeConfig = {
		// 	masterVolume: 0.018,
		// 	layers: [
		// 		{
		// 			volume: {
		// 				base: 1,
		// 				lfo: {
		// 					wave: "perlin",
		// 					rate: 0.22,
		// 					depth: 0.4
		// 				}
		// 			},
		// 			source: {
		// 				type: "noise"
		// 			},
		// 			filters: [
		// 				{
		// 					type: "bandpass",
		// 					frequency: {
		// 						base: 7458
		// 					},
		// 					Q: {
		// 						base: 0.9601
		// 					},
		// 					gain: {
		// 						base: 0
		// 					}
		// 				}
		// 			]
		// 		}
		// 	]
		// };

		// Initialize the player with the config.
		// this.ambience = new SoundscapePlayer(noiseConfig);
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}

	/** Responsible for calculating the exact UV offsets of the noise texture layers each frame. */
	public update(): void {
		if (this.heatWavePass) this.heatWavePass.time = performance.now() / 1000 * this.heatWaveSpeed;
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
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}