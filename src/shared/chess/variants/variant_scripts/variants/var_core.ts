// src/shared/chess/variants/variant_scripts/variants/var_core.ts

/**
 * "Core" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';

import icnconverter from '../../../logic/icn/icnconverter';

const POSITION_STRING =
	'p-1,10+|p3,10+|p4,10+|p5,10+|p6,10+|p10,10+|p0,9+|p9,9+|n0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|n9,8|p-2,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p11,7+|p-3,6+|p12,6+|p1,5+|P2,5+|P7,5+|p8,5+|P1,4+|p2,4+|p7,4+|P8,4+|P-3,3+|P12,3+|P-2,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P11,2+|N0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|N9,1|P0,0+|P9,0+|P-1,-1+|P3,-1+|P4,-1+|P5,-1+|P6,-1+|P10,-1+';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
