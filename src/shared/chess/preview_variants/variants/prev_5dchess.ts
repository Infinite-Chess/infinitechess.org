// src/shared/chess/preview_variants/variants/prev_5dchess.ts

/**
 * "5D Chess" 4D variant.
 */

import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../previewutil';

import gen4DPosition from '../gen4DPosition';
import { players as p } from '../../util/typeutil';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString';

export function getPosition(): { position: Map<CoordsKey, number> } {
	return { position: gen4DPosition.gen(8n, 8n, 9n, CLASSICAL_POSITION_STRING) };
}

export function gameruleModifications(): GameRuleModifications {
	return {
		winConditions: { [p.WHITE]: ['royalcapture'], [p.BLACK]: ['royalcapture'] },
		promotionRanks: {
			[p.WHITE]: [8n, 17n, 26n, 35n, 44n, 53n, 62n, 71n],
			[p.BLACK]: [1n, 10n, 19n, 28n, 37n, 46n, 55n, 64n],
		},
	};
}

export const worldBorderDist = 0n;
