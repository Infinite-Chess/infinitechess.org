// src/shared/chess/preview_variants/variants/prev_space.ts

/**
 * "Space" standard variant.
 */

import type { VariantPreview } from '../previewutil';

import icnconverter from '../../logic/icn/icnconverter';
import { DEFAULT_PROMOTIONS } from '../defaultPromotions';
import { rawTypes as r, players as p } from '../../util/typeutil';

const POSITION_STRING =
	'q4,31|ch4,23|p-12,18+|b4,18|p20,18+|p-11,17+|ar-10,17|p0,17+|b4,17|p8,17+|ar18,17|p19,17+|p-11,16+|p-10,16+|p-1,16+|p9,16+|p18,16+|p19,16+|p-1,15+|r0,15|ha4,15|r8,15|p9,15+|p3,6+|p4,6+|p5,6+|p2,5+|k4,5|p6,5+|n1,4|ce4,4|n7,4|p-10,3+|p-1,3+|p0,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p8,3+|p9,3+|p-12,2+|p-11,2+|p19,2+|p20,2+|p-13,1+|p21,1+|P-13,0+|P21,0+|P-12,-1+|P-11,-1+|P19,-1+|P20,-1+|P-1,-2+|P0,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P8,-2+|P9,-2+|P18,-2+|N1,-3|CE4,-3|N7,-3|P2,-4+|K4,-4|P6,-4+|P3,-5+|P4,-5+|P5,-5+|P-1,-14+|R0,-14|HA4,-14|R8,-14|P9,-14+|P-11,-15+|P-10,-15+|P-1,-15+|P9,-15+|P18,-15+|P19,-15+|P-11,-16+|AR-10,-16|P0,-16+|B4,-16|P8,-16+|AR18,-16|P19,-16+|P-12,-17+|B4,-17|P20,-17+|CH4,-22|Q4,-30';

export function getPreview(): VariantPreview {
	return {
		getPosition: () => icnconverter.generatePositionFromShortForm(POSITION_STRING).position,
		gameruleModifications: {
			promotionRanks: { [p.WHITE]: [4n], [p.BLACK]: [-3n] },
			promotionsAllowed: [
				...DEFAULT_PROMOTIONS,
				r.HAWK,
				r.CENTAUR,
				r.ARCHBISHOP,
				r.CHANCELLOR,
			],
		},
	};
}
