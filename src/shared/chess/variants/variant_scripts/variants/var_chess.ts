// src/shared/chess/variants/variant_scripts/variants/var_chess.ts

/**
 * "Chess" standard variant.
 */

import type { CoordsKey } from '../../../../util/coordutil.js';
import type { GameRuleModifications } from '../../../logic/variantmodule.js';

import icnposition from '../../../logic/icn/icnposition.js';
import { CLASSICAL_POSITION_STRING } from '../classicalposition.js';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnposition.parseShortFormPosition(CLASSICAL_POSITION_STRING);
}

export function gameruleModifications(): GameRuleModifications {
	return { worldBorder: { left: 1n, right: 8n, bottom: 1n, top: 8n } };
}

export function getPositionStringLength(): number {
	return CLASSICAL_POSITION_STRING.length;
}
