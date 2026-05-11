// src/shared/chess/load_variants/variants/load_omegafourth.ts

/**
 * Load data for the "Showcase: Omega^4" variant.
 */

import type { RawType } from '../../util/typeutil.js';

/**
 * Additional properties that are normally stored in the position string
 * in the form of '+', but isn't present since it's a generated position.
 */
export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: false };
}
