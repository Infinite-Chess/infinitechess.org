// src/shared/chess/util/modutil.ts

/**
 * Registry of all fun game modifiers, and the values each one may be set to.
 *
 * Current: Slide Limit.
 *
 * Future: Fog of War, Duck Chess, Antichess, Atomic, KoTH, Chess 960,
 * Obstocean (infinite obstacles), Drawback Chess, Progressive Chess.
 */

import * as z from 'zod';

// Types -----------------------------------------------------------------------

/** Union of all valid modifier kind strings, derived from the keys of {@link MODIFIER_ICONS}. */
export type ModifierCode = keyof typeof MODIFIER_ICONS;

/** A valid Slide Limit modifier value: max squares a sliding piece may travel. */
export type SlideLimitValue = (typeof SLIDE_LIMIT_VALUES)[number];

/**
 * Variables used to interpolate a modifier's parameterized rule-list phrasing
 * in the variant preview tooltip (e.g. `t.shared.variant_preview.slide_limit_rule`).
 */
type ModifierDescriptionVars = Record<string, string | number>;

// Constants -------------------------------------------------------------------

/** The SVG symbol each modifier is shown by. Its keys are the modifier registry. */
const MODIFIER_ICONS: Record<GameModifier['kind'], string> = {
	'slide-limit': 'svg-slide-limit',
};

/** Valid slide-limit distances in squares, matching the game setup modal's slider ticks. */
const SLIDE_LIMIT_VALUES = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30,
	40, 50,
	70,
	100,
] as const; // prettier-ignore

// Schemas ---------------------------------------------------------------------

/** The full configuration for a single game modifier, chosen on a seek and carried onto its game. */
export type GameModifier = z.infer<typeof GameModifierSchema>;
const GameModifierSchema = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('slide-limit'),
		value: z.literal(SLIDE_LIMIT_VALUES),
	}),
]);

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
	// Constants
	SLIDE_LIMIT_VALUES,
	// Schemas
	GameModifierSchema,
	// Functions
	getModifierIconId,
	getModifierDescriptionVars,
};
