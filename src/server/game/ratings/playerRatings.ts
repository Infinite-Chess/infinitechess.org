// src/server/game/ratings/playerRatings.ts

/**
 * A member's rating on a leaderboard as the rest of the server reads it: their stored row, or the
 * default a newcomer starts from. Also keeps every stored rating deviation decaying while idle.
 */

import type { Rating } from '../../../shared/chess/util/metadatautil.js';
import type { Leaderboard } from '../../../shared/chess/variants/leaderboardregistry.js';

import jsutil from '../../../shared/util/jsutil.js';

import logEvents from '../../utility/logEvents.js';
import ratingCalculation from '../../utility/ratingCalculation.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

// Types -----------------------------------------------------------------------

/** A member's stored rating on a leaderboard. */
type StoredRating = {
	elo: number;
	rating_deviation: number;
	/** Null for a newcomer, whose deviation has never been updated. */
	rd_last_update_date: string | null;
};

// Reading ---------------------------------------------------------------------

/**
 * A member's displayed rating on a leaderboard, or a newcomer's if they aren't on it.
 * @throws If a database error occurs.
 */
function get(user_id: number, leaderboard_id: Leaderboard): Rating {
	const stored = getStored(user_id, leaderboard_id);
	return ratingCalculation.toRating(stored.elo, stored.rating_deviation);
}

/**
 * A member's stored rating on a leaderboard, or the default a newcomer starts from.
 * @throws If a database error occurs.
 */
function getStored(user_id: number, leaderboard_id: Leaderboard): StoredRating {
	return (
		leaderboardsManager.getPlayerRating(user_id, leaderboard_id) ?? {
			elo: ratingCalculation.DEFAULT_LEADERBOARD_ELO,
			rating_deviation: ratingCalculation.DEFAULT_LEADERBOARD_RD,
			rd_last_update_date: null,
		}
	);
}

// Rating Deviation Decay ------------------------------------------------------

/** Calls {@link decayAll} every {@link ratingCalculation.RD_UPDATE_FREQUENCY} milliseconds. */
function startPeriodicDecay(): void {
	setInterval(() => decayAll(), ratingCalculation.RD_UPDATE_FREQUENCY);
}

/** Grows every stored rating deviation by the idle time since its last update. */
function decayAll(): void {
	try {
		const decayed = leaderboardsManager.getAll().map((entry) => ({
			...entry,
			rating_deviation: ratingCalculation.getTrueRD(entry.rating_deviation, entry.rd_last_update_date), // prettier-ignore
		}));
		leaderboardsManager.setPlayerRatings(decayed);
		logEvents.addAndPrint(
			`Updated all rating deviations in leaderboard table.`,
			'leaderboardLog',
		);
	} catch (error: unknown) {
		const detail = jsutil.getErrorStack(error);
		logEvents.addAndPrint(
			`Error updating all rating deviations in leaderboard table: ${detail}`,
			'errLog',
		);
	}
}

// Exports ---------------------------------------------------------------------

export default {
	// Reading
	get,
	getStored,
	// Rating Deviation Decay
	startPeriodicDecay,
};
