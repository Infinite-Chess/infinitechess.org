// src/shared/chess/load_variants/variants/load_4x4x4x4chess.ts

/**
 * Load data for the "4×4×4×4 Chess" 4D variant.
 */

import type { RawType } from '../../util/typeutil.js';
import type { Movesets } from '../../logic/movesets.js';
import type { SpecialMoveFunction, SpecialVicinity } from '../../logic/specialmove.js';

import { rawTypes as r } from '../../util/typeutil.js';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves.js';
import fourdimensionalloader from '../fourdimensionalloader.js';

/**
 * Additional properties that are normally stored in the position string
 * in the form of '+', but isn't present since it's a generated position.
 */
export function getGeneratorRules(): { pawnDoublePush: boolean; castleWith?: RawType } {
	return { pawnDoublePush: true };
}

/**
 * A function that returns the movesetModifications for the variant.
 * The movesetModifications do NOT need to contain the movesets of every piece,
 * but only of the pieces you do not want to use their default movement!
 */
export function getMovesetGenerator(): () => Movesets {
	return () => fourdimensionalloader.gen4DMoveset(4n, 4n, 5n, false, true);
}

/** Special Move overrides */
export function getSpecialMoves(): { [piece: string]: SpecialMoveFunction } {
	return { pawns: fourdimensionalmoves.doFourDimensionalPawnMove };
}

/**
 * Used for check calculation.
 * If we have any overrides for specialMoves, we should have overrides for
 * this, because it means the piece could make captures on different locations.
 */
export function getSpecialVicinity(): SpecialVicinity {
	return {
		[r.PAWN]: fourdimensionalloader.getPawnVicinity(5n, true),
		[r.KNIGHT]: fourdimensionalloader.getKnightVicinity(5n),
		[r.KING]: fourdimensionalloader.getKingVicinity(5n, false),
	};
}
