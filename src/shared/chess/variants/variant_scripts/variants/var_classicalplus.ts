// src/shared/chess/variants/variant_scripts/variants/var_classicalplus.ts

/**
 * "Classical+" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';

import icnconverter from '../../../logic/icn/icnconverter';

const POSITION_STRING =
	'p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p3,5+|p6,5+|P3,4+|P6,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
