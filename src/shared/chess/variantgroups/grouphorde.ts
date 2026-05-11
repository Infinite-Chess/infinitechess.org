// src/shared/chess/variantgroups/grouphorde.ts

import variantgroups from './variantgroups';

// Types -------------------------------------------------------------

/** Union of all valid variant codes, derived from the keys of {@link variantDictionary}. */
export type VariantCode_Horde = keyof typeof variantDictionary;

// ====================================== VARIANT DICTIONARY ======================================

/** Variant definitions for this group. */
const variantDictionary = variantgroups.buildVariantDictionary({
	Pawn_Horde: {
		name: 'Pawn Horde',
	},
});

// Exports -------------------------------------------------------------------------------

export default {
	variantDictionary,
};
