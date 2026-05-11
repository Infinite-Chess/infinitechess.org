// src/shared/chess/variantgroups/group4d/group4d.ts

import { Movesets } from '../../logic/movesets';
import variantgroups from '../variantgroups';
import fourdimensionalmoves from '../../logic/fourdimensionalmoves';
import fourdimensionalgenerator from './fourdimensionalgenerator';
import { rawTypes as r, players as p } from '../../util/typeutil';

// Types -------------------------------------------------------------

/** Union of all valid variant codes, derived from the keys of {@link variantDictionary}. */
export type VariantCode_4D = keyof typeof variantDictionary;

// ====================================== VARIANT DICTIONARY ======================================

/** Variant definitions for this group. */
const variantDictionary = variantgroups.buildVariantDictionary({
	'4x4x4x4_Chess': {
		name: '4×4×4×4 Chess',
		generator: {
			rules: { pawnDoublePush: true },
		},
		movesetGenerator: (): Movesets =>
			fourdimensionalgenerator.gen4DMoveset(4n, 4n, 5n, false, true),
		specialMoves: { pawns: fourdimensionalmoves.doFourDimensionalPawnMove },
		specialVicinity: {
			[r.PAWN]: fourdimensionalgenerator.getPawnVicinity(5n, true),
			[r.KNIGHT]: fourdimensionalgenerator.getKnightVicinity(5n),
			[r.KING]: fourdimensionalgenerator.getKingVicinity(5n, false),
		},
	},
	'5D_Chess': {
		name: '5D Chess',
		generator: {
			rules: { pawnDoublePush: true, castleWith: r.ROOK },
		},
		movesetGenerator: (): Movesets =>
			fourdimensionalgenerator.gen4DMoveset(8n, 8n, 9n, true, false),
		// WE HAVE TO EXPLICITLY STATE the royalcapture win condition so that it will go into the ICN!!! It doesn't matter the game will automatically swap from checkmate.
		specialMoves: { pawns: fourdimensionalmoves.doFourDimensionalPawnMove },
		specialVicinity: {
			[r.PAWN]: fourdimensionalgenerator.getPawnVicinity(9n, false),
			[r.KNIGHT]: fourdimensionalgenerator.getKnightVicinity(9n),
			[r.KING]: fourdimensionalgenerator.getKingVicinity(9n, true),
		},
	},
});

// Exports -------------------------------------------------------------------------------

export default {
	variantDictionary,
};
