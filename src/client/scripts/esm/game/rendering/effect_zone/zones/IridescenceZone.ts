
// src/client/scripts/esm/game/rendering/effect_zone/zones/Iridescence.ts

import UndercurrentSoundscape from "../soundscapes/UndercurrentSoundscape";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";


export class IridescenceZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 8; // <-- UPDATE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	private colorGradePass: ColorGradePass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;


	/** The hue shift cycle period, in seconds. */
	private cyclePeriod: number = 10.0;


	constructor(programManager: ProgramManager) {
		this.colorGradePass = new ColorGradePass(programManager);
        
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = UndercurrentSoundscape.config;

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(noiseConfig);
	}


	public update(): void {
		// Update the hue shift of the color grade
		this.colorGradePass.hueOffset = performance.now() / 1000 / this.cyclePeriod % 1;
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.colorGradePass];
	}
    
	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}