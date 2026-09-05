// src/client/scripts/esm/game/rendering/effectzone/zones/TheBeginningZone.ts

/**
 * A plain board — no visual effect, no ambience. The zone at the origin.
 */

import type { UniformValue } from '../../../../webgl/Renderable';

import { BaseZone } from '../BaseZone';

export class TheBeginningZone extends BaseZone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 0;

	public update(): void {
		// No dynamic state to update for a pass-through zone.
	}

	public getUniforms(): Record<string, UniformValue> {
		return {};
	}
}
