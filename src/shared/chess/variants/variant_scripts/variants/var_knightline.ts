// src/shared/chess/variants/variant_scripts/variants/var_knightline.ts

/**
 * "Knightline" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import icnconverter from '../../../logic/icn/icnconverter';
import { rawTypes as r } from '../../../util/typeutil';

const POSITION_STRING =
	'k5,8|n3,8|n4,8|n6,8|n7,8|p-5,7+|p-4,7+|p-3,7+|p-2,7+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,7+|p12,7+|p13,7+|p14,7+|p15,7+|K5,1|N3,1|N4,1|N6,1|N7,1|P-5,2+|P-4,2+|P-3,2+|P-2,2+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,2+|P12,2+|P13,2+|P14,2+|P15,2+';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotion: { pieces: [r.KNIGHT, r.QUEEN] },
	};
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
