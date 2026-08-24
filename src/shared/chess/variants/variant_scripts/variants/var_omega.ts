// src/shared/chess/variants/variant_scripts/variants/var_omega.ts

/**
 * "Omega" showcase variant.
 */

import type { CoordsKey } from '../../../../util/coordutil.js';
import type { BoundingBox } from '../../../../util/math/bounds.js';
import type { GameRuleModifications } from '../../../logic/variantmodule.js';

import timeutil from '../../../../util/timeutil.js';
import icnposition from '../../../logic/icn/icnposition.js';
import { players as p } from '../../../../util/typeutil.js';

const POSITION_STRINGS: Record<number, string> = {
	// May 15, 2024, 12:00AM - Pawns could no longer double push, that was a bug.
	1715731200000: 'r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3|Q-1,-3|P2,-3|K0,-4',
	// Original - Pawns could double push, as a bug.
	0: 'r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3+|Q-1,-3|P2,-3+|K0,-4',
};

export function getPosition(timestamp: number = Date.now()): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	const positionString = timeutil.resolveAtTimestamp(POSITION_STRINGS, timestamp);
	return icnposition.parseShortFormPosition(positionString);
}

export function gameruleModifications(): GameRuleModifications {
	return {
		turnOrder: [p.BLACK, p.WHITE],
		promotion: null,
		moveRule: null,
	};
}

export function getPositionStringLength(timestamp: number = Date.now()): number {
	return timeutil.resolveAtTimestamp(POSITION_STRINGS, timestamp).length;
}

export function getPositionBox(): BoundingBox {
	return { left: -2n, right: 2n, bottom: -4n, top: 4n };
}
