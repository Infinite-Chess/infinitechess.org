// src/shared/chess/variants/variant_scripts/variants/var_chess.ts

/**
 * "Chess" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil';

import icnconverter from '../../../logic/icn/icnconverter';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(CLASSICAL_POSITION_STRING);
}
export const worldBorderDist = 0n;

export function getPositionStringLength(): number {
	return CLASSICAL_POSITION_STRING.length;
}
