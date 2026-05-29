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
	/** The English display name. */
	name: string;
	/** SVG symbol ID for the modifier's icon. */
	iconId: string;
	/** Returns a human-readable description of this modifier for variant preview tooltips. */
	getDescription: (modifier: InviteModifier) => string;
};

/** Union of all valid modifier kind strings, derived from the keys of {@link MODIFIER_REGISTRY}. */
export type ModifierCode = keyof typeof MODIFIER_REGISTRY;

// ================================ MODIFIER REGISTRY ================================

const MODIFIER_REGISTRY = {
	'slide-limit': {
		name: 'Slide Limit',
		iconId: 'svg-slide-limit',
		getDescription: (modifier) =>
			`Pieces can't slide more than ${(modifier as Extract<InviteModifier, { kind: 'slide-limit' }>).value} squares`,
	},
} satisfies Record<InviteModifier['kind'], ModifierRegistryEntry>;

// Functions -------------------------------------------------------------------

/** Returns the English display name for the given modifier code. */
function getModifierName(code: ModifierCode): string {
	return MODIFIER_REGISTRY[code].name;
}

/** Returns the SVG symbol ID for the icon of the given modifier code. */
function getModifierIconId(code: ModifierCode): string {
	return MODIFIER_REGISTRY[code].iconId;
}

/** Returns a human-readable description of the modifier for variant preview tooltips. */
function getModifierDescription(modifier: InviteModifier): string {
	return MODIFIER_REGISTRY[modifier.kind].getDescription(modifier);
}

// Exports ---------------------------------------------------------------------

export default {
	getModifierName,
	getModifierIconId,
	getModifierDescription,
};
