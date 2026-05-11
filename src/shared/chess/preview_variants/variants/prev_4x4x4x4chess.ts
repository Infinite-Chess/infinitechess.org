// src/shared/chess/preview_variants/variants/prev_4x4x4x4chess.ts

/**
 * "4x4x4x4 Chess" 4D variant.
 */

import type { VariantPreview } from '../previewutil';

import gen4DPosition from '../gen4DPosition';
import { players as p } from '../../util/typeutil';

export function getPreview(): VariantPreview {
	return {
		getPosition: () =>
			gen4DPosition.gen(4n, 4n, 5n, {
				'0,0': 'P1,2|P2,2|P3,2|P4,2|R1,1|N2,1|N3,1|R4,1',
				'1,0': 'P1,2|P2,2|P3,2|P4,2|P1,1|P2,1|P3,1|P4,1',
				'2,0': 'P1,2|P2,2|P3,2|P4,2|B1,1|K2,1|Q3,1|B4,1',
				'3,0': 'P1,2|P2,2|P3,2|P4,2|R1,1|N2,1|N3,1|R4,1',
				'0,3': 'p1,3|p2,3|p3,3|p4,3|r1,4|n2,4|n3,4|r4,4',
				'1,3': 'p1,3|p2,3|p3,3|p4,3|b1,4|q2,4|k3,4|b4,4',
				'2,3': 'p1,3|p2,3|p3,3|p4,3|p1,4|p2,4|p3,4|p4,4',
				'3,3': 'p1,3|p2,3|p3,3|p4,3|r1,4|n2,4|n3,4|r4,4',
			}),
		gameruleModifications: {
			promotionRanks: { [p.WHITE]: [19n], [p.BLACK]: [1n] },
		},
		worldBorderDist: 0n,
	};
}
