// src/shared/chess/variants/variant_scripts/variants/var_confinedclassical.ts

/**
 * "Confined Classical" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';

import icnconverter from '../../../logic/icn/icnconverter';

const POSITION_STRING =
	'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+|ob0,0|ob0,1|ob0,2|ob0,7|ob0,8|ob0,9|ob9,0|ob9,1|ob9,2|ob9,7|ob9,8|ob9,9|ob1,0|ob2,0|ob3,0|ob4,0|ob5,0|ob6,0|ob7,0|ob8,0|ob1,9|ob2,9|ob3,9|ob4,9|ob5,9|ob6,9|ob7,9|ob8,9';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(POSITION_STRING);
}

export function getPositionStringLength(): number {
	return POSITION_STRING.length;
}
