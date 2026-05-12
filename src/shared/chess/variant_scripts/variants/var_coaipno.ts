// src/shared/chess/variant_scripts/variants/var_coaipno.ts

/**
 * "Chess on an Infinite Plane - Knightriders Option" standard variant.
 */

import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import variantutil from '../variantutil';
import icnconverter from '../../logic/icn/icnconverter';
import { rawTypes as r } from '../../util/typeutil';
import { DEFAULT_PROMOTIONS } from '../defaultPromotions';

const POSITION_STRINGS: Record<number, string> = {
	// 6:43 PM Dec 24, 2025, MST - Knightriders can no longer give a discovered check on move one.
	1766627026138:
		'P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+|nr-2,16|nr11,16|NR-2,-7|NR11,-7',
	// Original - Knightriders could give a discovered check on move one.
	0: 'P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+|nr-2,15|nr11,15|NR-2,-6|NR11,-6',
};

export function getPosition(timestamp: number = Date.now()): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	const positionString = variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp);
	return icnconverter.generatePositionFromShortForm(positionString);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotionsAllowed: [...DEFAULT_PROMOTIONS, r.GUARD, r.CHANCELLOR, r.KNIGHTRIDER],
	};
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}
