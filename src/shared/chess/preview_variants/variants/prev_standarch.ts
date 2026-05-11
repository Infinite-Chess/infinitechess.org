// src/shared/chess/preview_variants/variants/prev_standarch.ts

/**
 * "Standarch" standard variant.
 */

import type { VariantPreview } from '../previewutil';

import icnconverter from '../../logic/icn/icnconverter';
import { rawTypes as r } from '../../util/typeutil';
import { DEFAULT_PROMOTIONS } from '../defaultPromotions';

const POSITION_STRING =
	'p4,11+|p5,11+|p1,10+|p2,10+|p3,10+|p6,10+|p7,10+|p8,10+|p0,9+|ar4,9|ch5,9|p9,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P0,0+|AR4,0|CH5,0|P9,0+|P1,-1+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P8,-1+|P4,-2+|P5,-2+';

export function getPreview(): VariantPreview {
	return {
		getPosition: () => icnconverter.generatePositionFromShortForm(POSITION_STRING).position,
		gameruleModifications: {
			promotionsAllowed: [...DEFAULT_PROMOTIONS, r.CHANCELLOR, r.ARCHBISHOP],
		},
	};
}
