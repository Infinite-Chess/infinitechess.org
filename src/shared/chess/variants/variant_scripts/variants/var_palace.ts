// src/shared/chess/variants/variant_scripts/variants/var_palace.ts

/**
 * "Palace" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil.js';
import type { GameRuleModifications } from '../variantutil.js';

import icnconverter from '../../../logic/icn/icnconverter.js';
import { DEFAULT_PROMOTION_PIECES } from '../defaultPromotions.js';
import { rawTypes as r, players as p } from '../../../util/typeutil.js';

const POSITION_STRING =
	'K4,1|Q5,1|P6,2+|P5,2+|P4,2+|P3,2+|P2,2+|P1,2+|p1,4+|p2,4+|p3,4+|p4,4+|p5,4+|p6,4+|N6,1|AM3,1|Q2,1|N1,1|n1,5|n6,5|k4,5|q5,5|q2,5|am3,5|P6,-1+|P7,-1+|P8,-1+|P9,-1+|P1,-1+|P0,-1+|P-1,-1+|P-2,-1+|P2,-2+|P-3,-2+|P5,-2+|P10,-2+|p7,7+|p6,7+|p8,7+|p9,7+|p1,7+|p0,7+|p-1,7+|p-2,7+|p-3,8+|p2,8+|p5,8+|p10,8+|r-1,8|r-2,8|r8,8|r9,8|R8,-2|R9,-2|R-1,-2|R-2,-2|B0,-2|B1,-2|B7,-2|B6,-2|b0,8|b1,8|b7,8|b6,8';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotion: {
			ranks: { [p.WHITE]: [4n], [p.BLACK]: [2n] },
			pieces: [...DEFAULT_PROMOTION_PIECES, r.AMAZON],
		},
	};
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
