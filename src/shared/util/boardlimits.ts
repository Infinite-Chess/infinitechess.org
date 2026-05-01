// src/shared/util/boardlimits.ts

/**
 * This module contains shared board limit constants
 * used by both the client and server.
 */

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
 */
const TELEPORT_LIMIT: bigint = 10n ** 30n; // 10^30 squares

export default {
	TELEPORT_LIMIT,
};
