// src/shared/chess/load_variants/variants/load_5dchess.ts

/*
 * Load data for the "5D Chess" 4D variant.
 */

import type { Movesets } from '../../logic/movesets.js';
import type { RawType, RawTypeGroup } from '../../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../../logic/specialmove.js';

import { rawTypes as r } from '../../util/typeutil.js';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves.js';
import fourdimensionalloader from '../fourdimensionalloader.js';

export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: true, castleWith: r.ROOK };
}

export function getMovesetGenerator(): () => Movesets {
	return () => fourdimensionalloader.gen4DMoveset(8n, 8n, 9n, true, false);
}

export function getSpecialMoves(): RawTypeGroup<SpecialMoveFunction> {
	return { [r.PAWN]: fourdimensionalmoves.doFourDimensionalPawnMove };
}

export function getSpecialVicinity(): SpecialVicinity {
	return {
		[r.PAWN]: fourdimensionalloader.getPawnVicinity(9n, false),
		[r.KNIGHT]: fourdimensionalloader.getKnightVicinity(9n),
		[r.KING]: fourdimensionalloader.getKingVicinity(9n, true),
	};
}
