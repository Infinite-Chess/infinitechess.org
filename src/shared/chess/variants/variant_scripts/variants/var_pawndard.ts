// src/shared/chess/variants/variant_scripts/variants/var_pawndard.ts

/**
 * "Pawndard" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';

import variantutil from '../variantutil';
import icnconverter from '../../../logic/icn/icnconverter';

const POSITION_STRINGS: Record<number, string> = {
	// UTC March 31, 2026 - Kings are no longer given special rights.
	1774955419082:
		'b4,14|b5,14|r4,12|r5,12|p2,10+|p3,10+|p6,10+|p7,10+|p1,9+|p8,9+|p0,8+|n2,8|n3,8|k4,8|q5,8|n6,8|n7,8|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,5+|p2,5+|P3,5+|p6,5+|P7,5+|p8,5+|p1,4+|P2,4+|p3,4+|P6,4+|p7,4+|P8,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|N2,1|N3,1|Q4,1|K5,1|N6,1|N7,1|P9,1+|P1,0+|P8,0+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|R4,-3|R5,-3|B4,-5|B5,-5',
	// Original - Kings were given special rights.
	0: 'b4,14|b5,14|r4,12|r5,12|p2,10+|p3,10+|p6,10+|p7,10+|p1,9+|p8,9+|p0,8+|n2,8|n3,8|k4,8+|q5,8|n6,8|n7,8|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,5+|p2,5+|P3,5+|p6,5+|P7,5+|p8,5+|p1,4+|P2,4+|p3,4+|P6,4+|p7,4+|P8,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|N2,1|N3,1|Q4,1|K5,1+|N6,1|N7,1|P9,1+|P1,0+|P8,0+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|R4,-3|R5,-3|B4,-5|B5,-5',
};

export function getPosition(timestamp: number = Date.now()): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	const positionString = variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp);
	return icnconverter.generatePositionFromShortForm(positionString);
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}
