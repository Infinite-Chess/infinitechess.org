// src/shared/util/gameconfig.ts

/**
 * Shared game configuration constants used by both the client and server.
 */

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

/** Valid slide-limit distances in squares, matching the game setup modal's slider ticks. */
const SLIDE_LIMIT_VALUES = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30,
	40, 50,
	70,
	100,
] as const; // prettier-ignore

/** A valid Slide Limit modifier value: max squares a sliding piece may travel. */
export type SlideLimitValue = (typeof SLIDE_LIMIT_VALUES)[number];

export default {
	MIN_PLIES_BETWEEN_DRAW_OFFERS,
	TELEPORT_LIMIT,
	SLIDE_LIMIT_VALUES,
};
