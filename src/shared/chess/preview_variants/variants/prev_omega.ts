// src/shared/chess/preview_variants/variants/prev_omega.ts

/**
 * "Omega" showcase variant.
 */

import type { VariantPreview } from '../previewutil';

import previewutil from '../previewutil';
import icnconverter from '../../logic/icn/icnconverter';
import { players as p } from '../../util/typeutil';

const POSITION_STRINGS: Record<number, string> = {
	// May 15, 2024, 12:00AM - Pawns could no longer double push, that was a bug.
	1715731200000: 'r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3|Q-1,-3|P2,-3|K0,-4',
	// Original - Pawns could double push, as a bug.
	0: 'r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3+|Q-1,-3|P2,-3+|K0,-4',
};

export function getPreview(timestamp: number = Date.now()): VariantPreview {
	const positionString = previewutil.resolveAtTimestamp(POSITION_STRINGS, timestamp);
	return {
		getPosition: () => icnconverter.generatePositionFromShortForm(positionString).position,
		gameruleModifications: {
			turnOrder: [p.BLACK, p.WHITE],
			promotionsAllowed: null,
			moveRule: null,
		},
	};
}
