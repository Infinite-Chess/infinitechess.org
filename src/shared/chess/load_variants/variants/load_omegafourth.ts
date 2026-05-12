// src/shared/chess/load_variants/variants/load_omegafourth.ts

/*
 * Load data for the "Showcase: Omega^4" variant.
 */

import type { RawType } from '../../util/typeutil.js';

export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: false };
}
