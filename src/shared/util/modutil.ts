// src/shared/util/modutil.ts

/**
 * Registry of all fun game modifiers.
 *
 * Current: Slide Limit.
 *
 * Future: Fog of War, Duck Chess, Antichess, Atomic, KoTH, Chess 960,
 * Obstocean (infinite obstacles), Drawback Chess, Progressive Chess.
 */

import * as z from 'zod';

import gameconfig from './gameconfig.js';

// Types -----------------------------------------------------------------------

/** The full configuration for a single game modifier, chosen on a seek and carried onto its game. */
export type GameModifier = z.infer<typeof GameModifierSchema>;
export const GameModifierSchema = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('slide-limit'),
		value: z.literal(gameconfig.SLIDE_LIMIT_VALUES),
	}),
]);

/** Union of all valid modifier kind strings, derived from the keys of {@link MODIFIER_ICONS}. */
export type ModifierCode = keyof typeof MODIFIER_ICONS;

/**
 * Variables used to interpolate a modifier's parameterized rule-list phrasing
 * in the variant preview tooltip (e.g. `t.shared.variant_preview.slide_limit_rule`).
 */
type ModifierDescriptionVars = Record<string, string | number>;

// ================================ MODIFIER REGISTRY ================================

const MODIFIER_ICONS: Record<GameModifier['kind'], string> = {
	'slide-limit': 'svg-slide-limit',
};

// Functions -------------------------------------------------------------------

/** Returns the SVG symbol ID for the icon of the given modifier code. */
function getModifierIconId(code: ModifierCode): string {
	return MODIFIER_ICONS[code];
}

/**
 * Returns the variables used to interpolate the description of a modifier.
 * They MUST match the variables in the respective translation template
 * in the 'shared' component under client.variant_preview.modifier_descs.
 * Modifiers that don't need an active-value parameter should reuse their
 * static `t.shared.modifiers.<code>.description` directly with no vars.
 */
function getModifierDescriptionVars(modifier: GameModifier): ModifierDescriptionVars {
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
