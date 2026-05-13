// src/shared/chess/variant_scripts/defaultPromotions.ts

import { rawTypes as r } from '../util/typeutil.js';

/**
 * The default promotion pieces allowed, if the ICN does not specify.
 * If, when converting a game into ICN, the promotion.pieces gamerule
 * matches this, then we won't specify custom promotions in the ICN.
 */
export const DEFAULT_PROMOTION_PIECES = [r.QUEEN, r.ROOK, r.BISHOP, r.KNIGHT];
