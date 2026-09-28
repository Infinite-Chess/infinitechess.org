// src/client/scripts/esm/game/rendering/effectzone/zones/ContortionFieldZone.ts

/**
 * A board rippling & distorting under sine waves that slowly rotate their direction.
 */

import type { UniformValue } from '../../../../webgl/Renderable.js';
import type { PostProcessPass } from '../../../../webgl/postprocessing/PostProcessPass.js';

import deltatime from '../../../../board/deltatime.js';
import { BaseZone } from '../BaseZone.js';
import { SineWavePass } from '../../../../webgl/postprocessing/passes/SineWavePass.js';
import { ProgramManager } from '../../../../webgl/ProgramManager.js';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer.js';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape.js';

export class ContortionFieldZone extends BaseZone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 3;

	/** Post Processing Effect creating heat waves. */
	private sineWavePass: SineWavePass;

	/** How fast the sine waves oscillate. */
	private oscillationSpeed: number = 1.0;

	/** How fast the sine waves rotates, in degrees per second. */
	private rotationSpeed: number = 3.0;

	constructor(programManager: ProgramManager) {
		super();
		this.sineWavePass = new SineWavePass(programManager);

		// Load the ambience...

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);
	}

	public update(): void {
		const deltaTime = deltatime.get(); // Seconds

		this.sineWavePass.time = (performance.now() / 1000) * this.oscillationSpeed;
		this.sineWavePass.angle += this.rotationSpeed * deltaTime;
	}

	public getUniforms(): Record<string, UniformValue> {
		return {};
	}

	public override getPasses(): PostProcessPass[] {
		return [this.sineWavePass];
	}
}
