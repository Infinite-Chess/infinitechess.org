// src/shared/chess/variant_scripts/variants/var_knightedchess.ts

/**
 * "Knighted Chess" standard variant.
 */

import type { CoordsKey } from '../../util/coordutil';
import type { GameRuleModifications } from '../variantutil';

import variantutil from '../variantutil';
import icnconverter from '../../logic/icn/icnconverter';
import { rawTypes as r } from '../../util/typeutil';

const POSITION_STRINGS: Record<number, string> = {
	// UTC Aug 1, 2024, 12:00AM - Knightriders added.
	1722470400000:
		'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|NR2,1|NR7,1|nr2,8|nr7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+',
	// Original.
	0: 'P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|N2,1|N7,1|n2,8|n7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+',
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
		promotion: { pieces: [r.CHANCELLOR, r.KNIGHTRIDER, r.ARCHBISHOP, r.AMAZON] },
	};
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return variantutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}
