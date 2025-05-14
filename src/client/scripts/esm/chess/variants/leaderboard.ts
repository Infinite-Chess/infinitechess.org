/**
 * This script stores all global variables related to our leaderboards.
 */

/** Default elo for a player not contained in a leaderboard. We use the same default across the leaderboards, to avoid confusion. */
const DEFAULT_LEADERBOARD_ELO = 1500.0;

const Leaderboards = {
	/**
	 * The main leaderboard for all same-ish, infinity, variants.
	 * Doesn't include any finite variants, or non-symmetrical ones.
	 */
	INFINITY: 0,
	// Add more leaderboards here as needed
} as const;

type Leaderboard = typeof Leaderboards[keyof typeof Leaderboards];

/** Maps variants to the leaderboard they belong to, if they have one. */
const VariantLeaderboards: Record<string, Leaderboard> = {
	'Classical': Leaderboards.INFINITY,
	'Confined_Classical': Leaderboards.INFINITY,
	'Classical_Plus': Leaderboards.INFINITY,
	'CoaIP': Leaderboards.INFINITY,
	'CoaIP_HO': Leaderboards.INFINITY,
	'Knighted_Chess': Leaderboards.INFINITY,
	'Pawndard': Leaderboards.INFINITY,
	'Core': Leaderboards.INFINITY,
	'Standarch': Leaderboards.INFINITY,
	'Space_Classic': Leaderboards.INFINITY,
	'Space': Leaderboards.INFINITY,
	'Abundance': Leaderboards.INFINITY,
	// Add more variants and their corresponding leaderboard here
};

export {
	DEFAULT_LEADERBOARD_ELO,
	Leaderboard,
	Leaderboards,
	VariantLeaderboards,
};