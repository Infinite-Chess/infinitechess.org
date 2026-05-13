// src/shared/chess/variants/variant_scripts/variants/var_abundance.ts

/**
 * "Abundance" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import icnconverter from '../../../logic/icn/icnconverter';
import { DEFAULT_PROMOTION_PIECES } from '../defaultPromotions';
import { rawTypes as r, players as p } from '../../../util/typeutil';

const POSITION_STRING =
	'p-3,10+|ha-2,10|ha-1,10|r0,10|ha1,10|ha2,10|p3,10+|p-2,9+|p-1,9+|p1,9+|p2,9+|p-5,6+|gu-4,6|r-3,6+|b-2,6|b-1,6|k0,6+|b1,6|b2,6|r3,6+|gu4,6|p5,6+|p-4,5+|gu-3,5|n-1,5|q0,5|n1,5|gu3,5|p4,5+|p-3,4+|p-2,4+|gu-1,4|ch0,4|gu1,4|p2,4+|p3,4+|p-1,3+|p0,3+|p1,3+|P-1,-3+|P0,-3+|P1,-3+|P-3,-4+|P-2,-4+|GU-1,-4|CH0,-4|GU1,-4|P2,-4+|P3,-4+|P-4,-5+|GU-3,-5|N-1,-5|Q0,-5|N1,-5|GU3,-5|P4,-5+|P-5,-6+|GU-4,-6|R-3,-6+|B-2,-6|B-1,-6|K0,-6+|B1,-6|B2,-6|R3,-6+|GU4,-6|P5,-6+|P-2,-9+|P-1,-9+|P1,-9+|P2,-9+|P-3,-10+|HA-2,-10|HA-1,-10|R0,-10|HA1,-10|HA2,-10|P3,-10+';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotion: {
			ranks: { [p.WHITE]: [6n], [p.BLACK]: [-6n] },
			pieces: [...DEFAULT_PROMOTION_PIECES, r.GUARD, r.HAWK, r.CHANCELLOR],
		},
	};
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
