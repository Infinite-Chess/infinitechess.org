
/**
 * This script can weight a user's level of suspiciousness for rating abuse,
 * in attempt to boost their own elo.
 * 
 * This can include repeatedly losing on purpose on an alt account,
 * or playing illegal moves to abort games to avoid losing elo.
 * 
 * Naviary is notified by email of any flagged users.
 */

import { getRecentNRatedGamesForUser } from "../../database/playerGamesManager";


/** How many games played to measure their ratin abuse probability again. */
const GAME_INTERVAL_TO_MEASURE = 4;



/**
 * Red flags:
 * 
 * Opponents use the same IP address
 * Low move counts (games ended quickly)
 * Win streaks, especially against the same opponents
 * Rapid improvement over days/weeks that should take months, especially if account new
 * Low total rated loss count.
 * Opponents have low total casual matches, and low total rated wins.
 * 
 * Opponent accounts brand new
 * Low game time durations with a high number of close together games, or high clock values at end (indicates no thinking)
 * Excessive resignation terminations
 * Cheat reports against them
 */



/**
 * Weights a specific user's probability of rating abuse.
 * If it flags a user, it sends Naviary an email with data on them.
 */
function measurePlayerRatingAbuse(user_id: number, leaderboardId: number) {

	/** 1. Early exit if it hasn't been {@link GAME_INTERVAL_TO_MEASURE} games since the last measure. */


	/** 2. If they have net lost elo the past {@link GAME_INTERVAL_TO_MEASURE} games, no risk. */

	const recentGames = getRecentNRatedGamesForUser(
		user_id,
		leaderboardId,
		GAME_INTERVAL_TO_MEASURE,
        ['elo_change_from_game']
	) as { elo_change_from_game: number }[];
    
	const netRatingChange = recentGames.reduce(
		(acc, g) => acc + g.elo_change_from_game,
		0
	);

	if (netRatingChange <= 0) return; // They have lost elo. No cause for concern.

	// FINISH...
}




/**
 * New table: rating abuse
 * 
 * user_id PRIMARY KEY ON DELETE CASCADE
 * last_measure INTEGER NOT NULL -- Their game count we last measured them for rating abuse probability
 * ... some way to measure cheat report count? OR, should all cheat reports just automatically notify me by email?
 */

/**
 * Add to table: player games
 * time_at_end NUMBER
 * ISSUE: Previous logged games don't contain this information, maybe we can't have this cell.
 * 
 * Add to table: games
 * time_duration
 * ISSUE: Previous logged games don't contain this information, maybe we can't have this cell.
 */


export default {
	measurePlayerRatingAbuse,
};

