// src/shared/util/modutil.ts

/**
 * Registry of all fun game modifiers.
 *
 * Current: Slide Limit.
 *
 * Future: Fog of War, Duck Chess, Antichess, Atomic, KoTH, Chess 960,
 * Obstocean (infinite obstacles), Drawback Chess, Progressive Chess.
 */

import type { InviteModifier } from '../types.js';

// Types -----------------------------------------------------------------------

/** Entry in the modifier registry. */
type ModifierRegistryEntry = {
	/** SVG symbol ID for the modifier's icon. */
	iconId: string;
};

/** Union of all valid modifier kind strings, derived from the keys of {@link MODIFIER_REGISTRY}. */
export type ModifierCode = keyof typeof MODIFIER_REGISTRY;

/**
 * Variables used to interpolate a modifier's description
 * template from `t.shared.modifiers.<code>.description`.
 */
type ModifierDescriptionVars = Record<string, string | number>;

// ================================ MODIFIER REGISTRY ================================

const MODIFIER_REGISTRY = {
	'slide-limit': {
		iconId: 'svg-slide-limit',
	},
} satisfies Record<InviteModifier['kind'], ModifierRegistryEntry>;

// Functions -------------------------------------------------------------------

/** Returns the SVG symbol ID for the icon of the given modifier code. */
function getModifierIconId(code: ModifierCode): string {
	return MODIFIER_REGISTRY[code].iconId;
}

/**
 * Returns the variables used to interpolate the description of a modifier.
 * They MUST match the variables in the respective translation template
 * in the 'shared' component in the client.modifiers object.
 */
function getModifierDescriptionVars(modifier: InviteModifier): ModifierDescriptionVars {
	switch (modifier.kind) {
		case 'slide-limit':
			return { n: modifier.value };
	}
}

// Exports ---------------------------------------------------------------------

export default {
	getModifierIconId,
	getModifierDescriptionVars,
};
