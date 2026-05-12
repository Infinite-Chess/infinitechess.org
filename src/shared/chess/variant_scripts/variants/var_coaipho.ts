// src/shared/chess/variant_scripts/variants/var_coaipho.ts

/**
 * "Chess on an Infinite Plane - Huygens Option" standard variant.
 */

import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import icnconverter from '../../logic/icn/icnconverter';
import { rawTypes as r } from '../../util/typeutil';
import { DEFAULT_PROMOTIONS } from '../defaultPromotions';

const POSITION_STRING =
	'p-4,14+|ha-2,14|p0,14+|p9,14+|ha11,14|p13,14+|p-3,13+|p-1,13+|p10,13+|p12,13+|p-2,12+|p11,12+|gu-1,9|hu0,9|ch1,9|ch8,9|hu9,9|gu10,9|p-1,8+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p10,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P-1,1+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P10,1+|GU-1,0|HU0,0|CH1,0|CH8,0|HU9,0|GU10,0|P-2,-3+|P11,-3+|P-3,-4+|P-1,-4+|P10,-4+|P12,-4+|P-4,-5+|HA-2,-5|P0,-5+|P9,-5+|HA11,-5|P13,-5+';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		promotionsAllowed: [...DEFAULT_PROMOTIONS, r.GUARD, r.CHANCELLOR, r.HAWK, r.HUYGEN],
	};
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
