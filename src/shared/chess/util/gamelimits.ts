// src/shared/chess/util/gamelimits.ts

/**
 * The hardcoded bounds the game enforces, and that both ends must agree on.
 *
 * Every resident is a limit. A constant belongs here when it bounds something the client
 * and server both check, and no module owns the thing it bounds.
 */

// Play ------------------------------------------------------------------------

/**
 * Minimum number of plies (half-moves) that must span between 2 consecutive
 * draw offers by the same player.
 *
 * The server enforces it; the client reads it only to grey out its offer button.
 */
const MIN_PLIES_BETWEEN_DRAW_OFFERS = 2;

/**
 * A limit posed against teleporting too far.
 *
 * Don't want players to discover new zones quickly
 * without doing the work of zooming out :)
 * That would decrease the reward.
 *
 * FUTURE: I could allow teleporting up to 1e10000.
 * I roughly determined 1e75000 to be the bound for
 * no noticeable lag in websocket message size.
 * That would still prevent instantly exceeding that.
 * However, 1e10000 also experiences noticeable frame drops.
 */
const TELEPORT_LIMIT = 10n ** 30n; // 10^30 squares

// Positions -------------------------------------------------------------------

/**
 * The maximum position string length for a position to be eligible for
 * server-side move validation. A compute-cap. Above it risks server hitches.
 *
 * Obstocean (length 2425) is the largest supported variant; Omega Squared and above are not.
 */
const MAX_SERVER_VALIDATABLE_POSITION_LENGTH = 2500;

// Board Editor Saves ----------------------------------------------------------

/** Maximum length for a saved position's name. */
const MAX_POSITION_NAME_LENGTH = 70;

/** Maximum byte length for the ICN of a saved position. A storage-cap. */
const MAX_ICN_LENGTH = 1_000_000;

// Exports ---------------------------------------------------------------------

export default {
	// Play
	MIN_PLIES_BETWEEN_DRAW_OFFERS,
	TELEPORT_LIMIT,
	// Positions
	MAX_SERVER_VALIDATABLE_POSITION_LENGTH,
	// Board Editor Saves
	MAX_POSITION_NAME_LENGTH,
	MAX_ICN_LENGTH,
};
