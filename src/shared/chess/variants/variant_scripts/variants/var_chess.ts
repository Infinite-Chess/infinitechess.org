// src/shared/chess/variants/variant_scripts/variants/var_chess.ts

/**
 * "Chess" standard variant.
 */

import type { CoordsKey } from '../../../util/coordutil.js';
import type { GameRuleModifications } from '../variantutil.js';

import icnconverter from '../../../logic/icn/icnconverter.js';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString.js';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnconverter.generatePositionFromShortForm(CLASSICAL_POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return { worldBorder: { left: 1n, right: 8n, bottom: 1n, top: 8n } };
}

export function getPositionStringLength(): number {
	return CLASSICAL_POSITION_STRING.length;
}
