// src/shared/chess/variant_scripts/variants/var_spaceclassic.ts

/**
 * "Space Classic" standard variant.
 */

import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import variantutil from '../variantutil';
import icnconverter from '../../logic/icn/icnconverter';
import { players as p } from '../../util/typeutil';

const POSITION_STRINGS: Record<number, string> = {
	// March 12, 2024, 12:00 AM - Swapped black king & queen so they are on the same side as white king & queen.
	1710201600000:
		'p-3,18+|r2,18|b4,18|b5,18|r7,18|p12,18+|p-4,17+|p13,17+|p-5,16+|p14,16+|p3,9+|p4,9+|p5,9+|p6,9+|n3,8|k4,8|q5,8|n6,8|p-6,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p-8,6+|p-7,6+|p16,6+|p17,6+|p-9,5+|p18,5+|P-9,4+|P18,4+|P-8,3+|P-7,3+|P16,3+|P17,3+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P15,2+|N3,1|K4,1|Q5,1|N6,1|P3,0+|P4,0+|P5,0+|P6,0+|P-5,-7+|P14,-7+|P-4,-8+|P13,-8+|P-3,-9+|R2,-9|B4,-9|B5,-9|R7,-9|P12,-9+',
	// UTC Feb 27, 2024, 7:00 AM - Rebalanced. No more queen-bishop skewer.
	1709017200000:
		'p-3,18+|r2,18|b4,18|b5,18|r7,18|p12,18+|p-4,17+|p13,17+|p-5,16+|p14,16+|p3,9+|p4,9+|p5,9+|p6,9+|n3,8|q4,8|k5,8|n6,8|p-6,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p-8,6+|p-7,6+|p16,6+|p17,6+|p-9,5+|p18,5+|P-9,4+|P18,4+|P-8,3+|P-7,3+|P16,3+|P17,3+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P15,2+|N3,1|K4,1|Q5,1|N6,1|P3,0+|P4,0+|P5,0+|P6,0+|P-5,-7+|P14,-7+|P-4,-8+|P13,-8+|P-3,-9+|R2,-9|B4,-9|B5,-9|R7,-9|P12,-9+',
	// Original. Queen & rook were easily skewer'able.
	0: 'p-3,15+|q4,15|p11,15+|p-4,14+|b4,14|p12,14+|p-5,13+|r2,13|b4,13|r6,13|p13,13+|p3,5+|p4,5+|p5,5+|n3,4|k4,4|n5,4|p-6,3+|p1,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p7,3+|p-8,2+|p-7,2+|p15,2+|p16,2+|p-9,1+|p17,1+|P-9,0+|P17,0+|P-8,-1+|P-7,-1+|P15,-1+|P16,-1+|P1,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P14,-2+|N3,-3|K4,-3|N5,-3|P3,-4+|P4,-4+|P5,-4+|P-5,-12+|R2,-12|B4,-12|R6,-12|P13,-12+|P-4,-13+|B4,-13|P12,-13+|P-3,-14+|Q4,-14|P11,-14+',
};

const GAMERULE_MODIFICATIONS: Record<number, GameRuleModifications> = {
	// UTC Feb 27, 2024, 7:00 AM - Use standard promotion lines.
	1709017200000: {},
	// Original - Custom promotion ranks.
	0: {
		promotion: { ranks: { [p.WHITE]: [4n], [p.BLACK]: [-3n] } },
	},
};

export function getPosition(timestamp: number = Date.now()): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	const positionString = variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp);
	return icnconverter.generatePositionFromShortForm(positionString);
}

export function gameruleModifications(timestamp: number = Date.now()): GameRuleModifications {
	return variantutil.resolveAtTimestamp(GAMERULE_MODIFICATIONS, timestamp);
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}
