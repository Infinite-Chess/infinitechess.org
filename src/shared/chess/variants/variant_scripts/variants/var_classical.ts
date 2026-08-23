// src/shared/chess/variants/variant_scripts/variants/var_classical.ts

/**
 * "Classical" standard variant.
 */

import type { CoordsKey } from '../../../../util/coordutil.js';
import type { BoundingBox } from '../../../../util/math/bounds.js';

import icnposition from '../../../logic/icn/icnposition.js';
import { CLASSICAL_POSITION_STRING } from '../classicalPositionString.js';

export function getPosition(): {
	position: Map<CoordsKey, number>;
	specialRights: Set<CoordsKey>;
} {
	return icnposition.parseShortFormPosition(CLASSICAL_POSITION_STRING);
}

export function getPositionStringLength(): number {
	return CLASSICAL_POSITION_STRING.length;
}

export function getPositionBox(): BoundingBox {
	return { left: 1n, right: 8n, bottom: 1n, top: 8n };
}
