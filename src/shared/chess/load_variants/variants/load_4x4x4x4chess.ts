// src/shared/chess/load_variants/variants/load_4x4x4x4chess.ts

/*
 * Load data for the "4×4×4×4 Chess" 4D variant.
 */

import type { Movesets } from '../../logic/movesets.js';
import type { RawType, RawTypeGroup } from '../../util/typeutil.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../../logic/specialmove.js';

import { rawTypes as r } from '../../util/typeutil.js';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves.js';
import fourdimensionalloader from '../fourdimensionalloader.js';

export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: true };
}

export function genMovesetModifications(): Movesets {
	return fourdimensionalloader.gen4DMoveset(4n, 4n, 5n, false, true);
}

export function getSpecialMoves(): RawTypeGroup<SpecialMoveFunction> {
	return { [r.PAWN]: fourdimensionalmoves.doFourDimensionalPawnMove };
}

export function getSpecialVicinity(): SpecialVicinity {
	return {
		[r.PAWN]: fourdimensionalloader.getPawnVicinity(5n, true),
		[r.KNIGHT]: fourdimensionalloader.getKnightVicinity(5n),
		[r.KING]: fourdimensionalloader.getKingVicinity(5n, false),
	};
}
