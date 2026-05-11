// src/shared/chess/preview_variants/variants/prev_obstocean.ts

/**
 * "Obstocean" standard variant.
 */

import type { VariantPreview } from '../previewutil';

import icnconverter from '../../logic/icn/icnconverter';

const POSITION_STRING =
	'ob-6,12|ob-5,12|ob-4,12|ob-3,12|ob-2,12|ob-1,12|ob0,12|ob1,12|ob2,12|ob3,12|ob4,12|ob5,12|ob6,12|ob7,12|ob8,12|ob9,12|ob10,12|ob11,12|ob12,12|ob13,12|ob14,12|ob15,12|ob-6,11|ob-5,11|ob-4,11|ob-3,11|ob-2,11|ob-1,11|ob0,11|ob1,11|ob2,11|ob3,11|ob4,11|ob5,11|ob6,11|ob7,11|ob8,11|ob9,11|ob10,11|ob11,11|ob12,11|ob13,11|ob14,11|ob15,11|ob-6,10|ob-5,10|ob-4,10|ob-3,10|ob-2,10|ob-1,10|ob0,10|ob1,10|ob2,10|ob3,10|ob4,10|ob5,10|ob6,10|ob7,10|ob8,10|ob9,10|ob10,10|ob11,10|ob12,10|ob13,10|ob14,10|ob15,10|ob-6,9|ob-5,9|ob-4,9|ob-3,9|ob-2,9|ob-1,9|ob0,9|ob1,9|ob2,9|ob3,9|ob4,9|ob5,9|ob6,9|ob7,9|ob8,9|ob9,9|ob10,9|ob11,9|ob12,9|ob13,9|ob14,9|ob15,9|ob-6,8|ob-5,8|ob-4,8|ob-3,8|ob-2,8|ob-1,8|ob0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|ob9,8|ob10,8|ob11,8|ob12,8|ob13,8|ob14,8|ob15,8|ob-6,7|ob-5,7|ob-4,7|ob-3,7|ob-2,7|ob-1,7|ob0,7|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|ob9,7|ob10,7|ob11,7|ob12,7|ob13,7|ob14,7|ob15,7|ob-6,6|ob-5,6|ob-4,6|ob-3,6|ob-2,6|ob-1,6|ob0,6|ob1,6|ob2,6|ob3,6|ob4,6|ob5,6|ob6,6|ob7,6|ob8,6|ob9,6|ob10,6|ob11,6|ob12,6|ob13,6|ob14,6|ob15,6|ob-6,5|ob-5,5|ob-4,5|ob-3,5|ob-2,5|ob-1,5|ob0,5|ob1,5|ob2,5|ob3,5|ob4,5|ob5,5|ob6,5|ob7,5|ob8,5|ob9,5|ob10,5|ob11,5|ob12,5|ob13,5|ob14,5|ob15,5|ob-6,4|ob-5,4|ob-4,4|ob-3,4|ob-2,4|ob-1,4|ob0,4|ob1,4|ob2,4|ob3,4|ob4,4|ob5,4|ob6,4|ob7,4|ob8,4|ob9,4|ob10,4|ob11,4|ob12,4|ob13,4|ob14,4|ob15,4|ob-6,3|ob-5,3|ob-4,3|ob-3,3|ob-2,3|ob-1,3|ob0,3|ob1,3|ob2,3|ob3,3|ob4,3|ob5,3|ob6,3|ob7,3|ob8,3|ob9,3|ob10,3|ob11,3|ob12,3|ob13,3|ob14,3|ob15,3|ob-6,2|ob-5,2|ob-4,2|ob-3,2|ob-2,2|ob-1,2|ob0,2|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|ob9,2|ob10,2|ob11,2|ob12,2|ob13,2|ob14,2|ob15,2|ob-6,1|ob-5,1|ob-4,1|ob-3,1|ob-2,1|ob-1,1|ob0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|ob9,1|ob10,1|ob11,1|ob12,1|ob13,1|ob14,1|ob15,1|ob-6,0|ob-5,0|ob-4,0|ob-3,0|ob-2,0|ob-1,0|ob0,0|ob1,0|ob2,0|ob3,0|ob4,0|ob5,0|ob6,0|ob7,0|ob8,0|ob9,0|ob10,0|ob11,0|ob12,0|ob13,0|ob14,0|ob15,0|ob-6,-1|ob-5,-1|ob-4,-1|ob-3,-1|ob-2,-1|ob-1,-1|ob0,-1|ob1,-1|ob2,-1|ob3,-1|ob4,-1|ob5,-1|ob6,-1|ob7,-1|ob8,-1|ob9,-1|ob10,-1|ob11,-1|ob12,-1|ob13,-1|ob14,-1|ob15,-1|ob-6,-2|ob-5,-2|ob-4,-2|ob-3,-2|ob-2,-2|ob-1,-2|ob0,-2|ob1,-2|ob2,-2|ob3,-2|ob4,-2|ob5,-2|ob6,-2|ob7,-2|ob8,-2|ob9,-2|ob10,-2|ob11,-2|ob12,-2|ob13,-2|ob14,-2|ob15,-2|ob-6,-3|ob-5,-3|ob-4,-3|ob-3,-3|ob-2,-3|ob-1,-3|ob0,-3|ob1,-3|ob2,-3|ob3,-3|ob4,-3|ob5,-3|ob6,-3|ob7,-3|ob8,-3|ob9,-3|ob10,-3|ob11,-3|ob12,-3|ob13,-3|ob14,-3|ob15,-3';

export function getPreview(): VariantPreview {
	return {
		getPosition: () => icnconverter.generatePositionFromShortForm(POSITION_STRING).position,
		worldBorderDist: 0n,
	};
}
