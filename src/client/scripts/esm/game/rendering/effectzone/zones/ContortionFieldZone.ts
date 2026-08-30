// src/client/scripts/esm/game/rendering/effectzone/zones/ContortionFieldZone.ts

/**
 * A board rippling & distorting under sine waves that slowly rotate their direction.
 */

import type { UniformValue } from '../../../../webgl/Renderable';
import type { PostProcessPass } from '../../../../webgl/postprocessing/PostProcessPass';

import deltatime from '../../../../board/deltatime.js';
import { BaseZone } from '../BaseZone';
import { SineWavePass } from '../../../../webgl/postprocessing/passes/SineWavePass';
import { ProgramManager } from '../../../../webgl/ProgramManager';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';

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
