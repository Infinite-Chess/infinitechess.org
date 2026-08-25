// src/shared/chess/variants/leaderboardregistry.ts

/**
 * The leaderboards a rated game can count towards, which variants belong to each,
 * and what else a seek must satisfy to be rated at all.
 */

import type { Player } from '../../util/typeutil.js';
import type { TimeControl } from '../util/clockutil.js';
import type { SeekVariant } from '../util/variantselection.js';
import type { VariantCode } from '../util/variantcodes.js';
import type { GameModifier } from '../util/modutil.js';

// Types -----------------------------------------------------------------------

export type Leaderboard = (typeof IDS)[keyof typeof IDS];

// Constants -------------------------------------------------------------------

/** Every leaderboard, by name. */
const IDS = {
	/**
	 * The main leaderboard for all same-ish, infinity, variants.
	 * Doesn't include any finite variants, or non-symmetrical ones.
	 */
	INFINITY: 0,
	// Add more leaderboards here as needed
} as const;

/** Maps variants to the leaderboard they belong to, if they have one. */
const BY_VARIANT: Partial<Record<VariantCode, Leaderboard>> = {
	Classical: IDS.INFINITY,
	Confined_Classical: IDS.INFINITY,
	Classical_Plus: IDS.INFINITY,
	CoaIP: IDS.INFINITY,
	CoaIP_HO: IDS.INFINITY,
	CoaIP_RO: IDS.INFINITY,
	CoaIP_NO: IDS.INFINITY,
	Palace: IDS.INFINITY,
	Pawndard: IDS.INFINITY,
	Core: IDS.INFINITY,
	Standarch: IDS.INFINITY,
	Space_Classic: IDS.INFINITY,
	Space: IDS.INFINITY,
	Abundance: IDS.INFINITY,
	// Add more variants and their corresponding leaderboard here
};

// Functions -------------------------------------------------------------------

/**
 * The leaderboard a seek or game belongs to, or `undefined` if it belongs to none.
 * Only preset variants can: a custom position is unique to its game.
 */
function ofVariant(variant: SeekVariant): Leaderboard | undefined {
	return variant.kind === 'preset' ? BY_VARIANT[variant.code] : undefined;
}

/**
 * Returns `true` if the given seek options are eligible for a rated game.
 * Mirrors the server-side seek validation logic to avoid redundant checks.
 */
function isRatedAllowed(
	variant: SeekVariant | null,
	time: TimeControl,
	color: Player | null,
	modifiers: GameModifier[] | undefined,
): boolean {
	if (variant === null) return false;
	if (variant.kind !== 'preset') return false; // Custom variants are never rated
	if (!(variant.code in BY_VARIANT)) return false; // Variant needs a leaderboard
	if (time === '-') return false; // Must be timed
	if (color !== null) return false; // No specific color for rated **public** games
	if ((modifiers?.length ?? 0) > 0) return false; // No modifiers for rated
	return true;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	IDS,
	BY_VARIANT,
	// Functions
	ofVariant,
	isRatedAllowed,
};
