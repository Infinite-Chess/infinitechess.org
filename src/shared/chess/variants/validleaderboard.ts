// src/shared/chess/variants/validleaderboard.ts

/**
 * The leaderboards a rated game can count towards, and which variants belong to each.
 */

import type { SeekVariant } from '../../chess/variants/variantselection.js';
import type { VariantCode } from '../util/variantcodes.js';

// Types -----------------------------------------------------------------------

type Leaderboard = (typeof Leaderboards)[keyof typeof Leaderboards];

// Constants -------------------------------------------------------------------

/** Every leaderboard, by name. */
const Leaderboards = {
	/**
	 * The main leaderboard for all same-ish, infinity, variants.
	 * Doesn't include any finite variants, or non-symmetrical ones.
	 */
	INFINITY: 0,
	// Add more leaderboards here as needed
} as const;

/** Maps variants to the leaderboard they belong to, if they have one. */
const VariantLeaderboards: Partial<Record<VariantCode, Leaderboard>> = {
	Classical: Leaderboards.INFINITY,
	Confined_Classical: Leaderboards.INFINITY,
	Classical_Plus: Leaderboards.INFINITY,
	CoaIP: Leaderboards.INFINITY,
	CoaIP_HO: Leaderboards.INFINITY,
	CoaIP_RO: Leaderboards.INFINITY,
	CoaIP_NO: Leaderboards.INFINITY,
	Palace: Leaderboards.INFINITY,
	Pawndard: Leaderboards.INFINITY,
	Core: Leaderboards.INFINITY,
	Standarch: Leaderboards.INFINITY,
	Space_Classic: Leaderboards.INFINITY,
	Space: Leaderboards.INFINITY,
	Abundance: Leaderboards.INFINITY,
	// Add more variants and their corresponding leaderboard here
};

// Functions -------------------------------------------------------------------

/**
 * The leaderboard a seek or game belongs to, or `undefined` if it belongs to none.
 * Only preset variants can: a custom position is unique to its game.
 */
function getLeaderboardOfVariant(variant: SeekVariant): Leaderboard | undefined {
	return variant.kind === 'preset' ? VariantLeaderboards[variant.code] : undefined;
}

// Exports ---------------------------------------------------------------------

export { Leaderboard, Leaderboards, VariantLeaderboards, getLeaderboardOfVariant };
