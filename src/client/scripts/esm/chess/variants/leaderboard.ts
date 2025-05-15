/**
 * This script stores all global variables related to our leaderboards.
 */


// Default variables, shared across all leaderboards ------------------------------------------------------------------


/** Default elo for a player not contained in a leaderboard. We use the same default across the leaderboards, to avoid confusion. */
const DEFAULT_LEADERBOARD_ELO = 1500.0;

/** Default rating deviation, used for Glicko-1 */
const DEFAULT_LEADERBOARD_RD = 350.0;

/** Minimum rating deviation, used for Glicko-1 */
const MIMIMUM_LEADERBOARD_RD = 30.0;

/** Rating deviations above this are considered to be too uncertain and the user is excluded from leaderboards */
const UNCERTAIN_LEADERBOARD_RD = 250.0;

/** Constant c, used for Glicko-1 */
const GLICKO_ONE_C = 70;

/** Constant q, used for Glicko-1 */
const GLICKO_ONE_Q = 0.00575646273;

/** Duration of a glicko-1 rating period, in milliseconds */
const RATING_PERIOD_DURATION = 1000 * 60 * 60 * 24 * 15; // 15 days


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
	DEFAULT_LEADERBOARD_RD,
	MIMIMUM_LEADERBOARD_RD,
	UNCERTAIN_LEADERBOARD_RD,
	GLICKO_ONE_C,
	GLICKO_ONE_Q,
	RATING_PERIOD_DURATION,
	Leaderboard,
	Leaderboards,
	VariantLeaderboards,
};