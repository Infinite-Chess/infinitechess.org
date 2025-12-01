// src/client/scripts/esm/game/rendering/effect_zone/zones/ContortionFieldZone.ts

// @ts-ignore
import loadbalancer from '../../../misc/loadbalancer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import { ProgramManager } from '../../../../webgl/ProgramManager';
import { Zone } from '../EffectZoneManager';
import { SineWavePass } from '../../../../webgl/post_processing/passes/SineWavePass';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';

export class ContortionFieldZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 3;

	/** Post Processing Effect creating heat waves. */
	private sineWavePass: SineWavePass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	/** How fast the sine waves oscillate. */
	private oscillationSpeed: number = 1.0;

	/** How fast the sine waves rotates, in degrees per second. */
	private rotationSpeed: number = 3.0;

	constructor(programManager: ProgramManager) {
		this.sineWavePass = new SineWavePass(programManager);

		// Load the ambience...

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}

	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime(); // Seconds

		this.sineWavePass.time = (performance.now() / 1000) * this.oscillationSpeed;
		this.sineWavePass.angle += this.rotationSpeed * deltaTime;
	}

	public getUniforms(): Record<string, any> {
		return {};
	}

	public getPasses(): PostProcessPass[] {
		return [this.sineWavePass];
	}

	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}
