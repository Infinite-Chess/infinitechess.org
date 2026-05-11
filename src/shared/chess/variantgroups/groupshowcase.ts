// src/shared/chess/variantgroups/groupshowcase.ts

import variantgroups from './variantgroups';

// Types -------------------------------------------------------------

/** Union of all valid variant codes, derived from the keys of {@link variantDictionary}. */
export type VariantCode_Showcase = keyof typeof variantDictionary;

// ====================================== VARIANT DICTIONARY ======================================

/** Variant definitions for this group. */
const variantDictionary = variantgroups.buildVariantDictionary({
	Omega: {
		name: 'Showcase: Omega',
	},
	Omega_Squared: {
		name: 'Showcase: Omega^2',
		annotePresets: {
			squares:
				'-42,76|16,86|15,84|27,88|35,80|37,82|33,86|37,90|41,86|41,80|44,80|27,2|53,71',
			rays: '23,94>-1,0|23,76>-1,0|17,88>0,1|16,82>0,-1|68,72>0,1|68,71>0,-1|60,64>0,1|72,68>0,-1',
		},
	},
	Omega_Cubed: {
		name: 'Showcase: Omega^3',
		generator: {
			// Additional properties that are normally stored in the position string in the form of '+', but isn't present since it's a generated position.
			rules: { pawnDoublePush: false },
		},
	},
	Omega_Fourth: {
		name: 'Showcase: Omega^4',
		generator: {
			// Additional properties that are normally stored in the position string in the form of '+', but isn't present since it's a generated position.
			rules: { pawnDoublePush: false },
		},
	},
});

// Exports -------------------------------------------------------------------------------

export default {
	variantDictionary,
};
