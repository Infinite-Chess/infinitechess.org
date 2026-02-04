// src/client/scripts/esm/game/rendering/effect_zone/zones/AshfallVocsZone.ts

import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';
import { Zone } from '../EffectZoneManager';
import { HeatWavePass } from '../../../../webgl/post_processing/passes/HeatWavePass';
import { VignettePass } from '../../../../webgl/post_processing/passes/VignettePass';
import { ProgramManager } from '../../../../webgl/ProgramManager';
import { ColorGradePass } from '../../../../webgl/post_processing/passes/ColorGradePass';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import { SoundscapeConfig, SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class AshfallVocsZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 9;

	private colorGradePass: ColorGradePass;
	private vignettePass: VignettePass;
	private heatWavePass: HeatWavePass | undefined = undefined;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	/** The speed of the moving heat waves. */
	private heatWaveSpeed: number = 2.0;

	constructor(programManager: ProgramManager, noise: Promise<WebGLTexture>) {
		noise.then((texture) => (this.heatWavePass = new HeatWavePass(programManager, texture)));

		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 2;
		this.colorGradePass.contrast = 1.4;
		this.colorGradePass.brightness = -0.35;
		this.colorGradePass.tint = [1.0, 0.4, 0.4];

		this.vignettePass = new VignettePass(programManager);
		this.vignettePass.radius = 0.3;
		this.vignettePass.softness = 0.5;
		this.vignettePass.intensity = 0.7;

		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.36,
			layers: [
				...UndercurrentSoundscape.config.layers,
				{
					// High pitched sizzling
					volume: {
						base: 0.005,
						lfo: {
							wave: 'perlin',
							rate: 0.22,
							depth: 0.002,
						},
					},
					source: {
						type: 'noise',
					},
					filters: [
						{
							type: 'bandpass',
							frequency: {
								base: 10000,
							},
							Q: {
								base: 0.9601,
							},
							gain: {
								base: 0,
							},
						},
					],
				},
			],
		};

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(noiseConfig);
	}

	public update(): void {
		if (this.heatWavePass)
			this.heatWavePass.time = (performance.now() / 1000) * this.heatWaveSpeed;
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
