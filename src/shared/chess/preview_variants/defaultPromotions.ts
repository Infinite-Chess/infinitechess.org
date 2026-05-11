// src/shared/chess/preview_variants/defaultPromotions.ts

import { rawTypes as r } from '../util/typeutil';

/**
 * The default promotions allowed, if the ICN does not specify.
 * If, when converting a game into ICN, the promotionsAllowed
 * gamerule matches this, then we won't specify custom promotions in the ICN.
 */
export const DEFAULT_PROMOTIONS = [r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT];
