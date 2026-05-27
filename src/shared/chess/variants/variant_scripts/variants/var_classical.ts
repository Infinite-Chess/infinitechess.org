// src/shared/chess/variants/variant_scripts/variants/var_classical.ts

/**
 * "Classical" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil.js';

import icnconverter from '../../../logic/icn/icnconverter.js';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString.js';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(CLASSICAL_POSITION_STRING);
}

export function getPositionStringLength(): number {
	return CLASSICAL_POSITION_STRING.length;
}
