// src/shared/chess/preview_variants/variants/prev_classical.ts

/**
 * "Classical" standard variant.
 */

import type { VariantPreview } from '../previewutil';

import icnconverter from '../../logic/icn/icnconverter';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString';

export function getPreview(): VariantPreview {
	return {
		getPosition: () =>
			icnconverter.generatePositionFromShortForm(CLASSICAL_POSITION_STRING).position,
	};
}
