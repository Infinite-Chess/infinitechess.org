// src/shared/chess/variants/variant_scripts/variants/var_pawnhorde.ts

/**
 * "Pawn Horde" horde variant.
 */

import type { CoordsKey } from '../../../util/coordutil.js';
import type { GameRuleModifications } from '../variantutil.js';

import variantutil from '../variantutil.js';
import icnconverter from '../../../logic/icn/icnconverter.js';
import { players as p } from '../../../util/typeutil.js';

const POSITION_STRINGS: Record<number, string> = {
	// UTC Jan 25, 2024, 4:00 AM - 1 pawn removed on the sides, for a total of 2 added.
	1706155200000:
		'k5,2+|q4,2|r1,2+|n7,2|n2,2|r8,2+|b3,2|b6,2|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P1,-2+|P2,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P8,-2+|P1,-3+|P2,-3+|P4,-3+|P5,-3+|P6,-3+|P7,-3+|P8,-3+|P1,-4+|P2,-4+|P4,-4+|P5,-4+|P6,-4+|P7,-4+|P8,-4+|P1,-5+|P2,-5+|P4,-5+|P5,-5+|P6,-5+|P7,-5+|P8,-5+|P1,-6+|P2,-6+|P4,-6+|P5,-6+|P6,-6+|P7,-6+|P8,-6+|P3,-2+|P3,-3+|P3,-4+|P3,-5+|P3,-6+|P1,-7+|P2,-7+|P3,-7+|P4,-7+|P5,-7+|P6,-7+|P7,-7+|P8,-7+|P0,-6+|P0,-7+|P9,-6+|P9,-7+|p9,2+|p1,1+|p2,1+|p3,1+|p4,1+|p5,1+|p6,1+|p7,1+|p8,1+|p0,2+',
	// UTC Nov 17, 2023, 12:00 AM - 3 more pawns added on sides.
	1700179200000:
		'k5,2+|q4,2|r1,2+|n7,2|n2,2|r8,2+|b3,2|b6,2|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P1,-2+|P2,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P8,-2+|P1,-3+|P2,-3+|P4,-3+|P5,-3+|P6,-3+|P7,-3+|P8,-3+|P1,-4+|P2,-4+|P4,-4+|P5,-4+|P6,-4+|P7,-4+|P8,-4+|P1,-5+|P2,-5+|P4,-5+|P5,-5+|P6,-5+|P7,-5+|P8,-5+|P1,-6+|P2,-6+|P4,-6+|P5,-6+|P6,-6+|P7,-6+|P8,-6+|P3,-2+|P3,-3+|P3,-4+|P3,-5+|P3,-6+|P1,-7+|P2,-7+|P3,-7+|P4,-7+|P5,-7+|P6,-7+|P7,-7+|P8,-7+|P0,-6+|P0,-7+|P9,-6+|P9,-7+|P0,-5+|P9,-5+|p9,2+|p1,1+|p2,1+|p3,1+|p4,1+|p5,1+|p6,1+|p7,1+|p8,1+|p0,2+',
	// Original - No pawns on the side.
	0: 'k5,2+|q4,2|r1,2+|n7,2|n2,2|r8,2+|b3,2|b6,2|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P1,-2+|P2,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P8,-2+|P1,-3+|P2,-3+|P4,-3+|P5,-3+|P6,-3+|P7,-3+|P8,-3+|P1,-4+|P2,-4+|P4,-4+|P5,-4+|P6,-4+|P7,-4+|P8,-4+|P1,-5+|P2,-5+|P4,-5+|P5,-5+|P6,-5+|P7,-5+|P8,-5+|P1,-6+|P2,-6+|P4,-6+|P5,-6+|P6,-6+|P7,-6+|P8,-6+|P3,-2+|P3,-3+|P3,-4+|P3,-5+|P3,-6+|P1,-7+|P2,-7+|P3,-7+|P4,-7+|P5,-7+|P6,-7+|P7,-7+|P8,-7+|p9,2+|p1,1+|p2,1+|p3,1+|p4,1+|p5,1+|p6,1+|p7,1+|p8,1+|p0,2+',
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
		winConditions: { [p.WHITE]: ['checkmate'], [p.BLACK]: ['allpiecescaptured'] },
		promotion: { ranks: { [p.WHITE]: [2n], [p.BLACK]: [-7n] } },
	};
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}
