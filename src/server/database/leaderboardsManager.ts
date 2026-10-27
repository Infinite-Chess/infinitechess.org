// src/server/database/leaderboardsManager.ts

/**
 * This script handles queries to the leaderboards table.
 */

import type { Leaderboard } from '../../shared/chess/variants/leaderboardregistry.js';

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete leaderboard entry record. */
interface LeaderboardEntry {
	user_id: number;
	leaderboard_id: Leaderboard;
	elo: number;
	rating_deviation: number;
	rd_last_update_date: string;
}

// Methods ---------------------------------------------------------------------

/**
 * Sets players' ratings, adding each to their leaderboard if absent, and stamps each rating
 * deviation's last update as now. All or none, in a single transaction.
 * @throws If a database error occurs.
 */
function setPlayerRatings(
	entries: Pick<LeaderboardEntry, 'user_id' | 'leaderboard_id' | 'elo' | 'rating_deviation'>[],
): void {
	const query = `
		INSERT INTO leaderboards (user_id, leaderboard_id, elo, rating_deviation, rd_last_update_date)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id, leaderboard_id) DO UPDATE SET
			elo = excluded.elo,
			rating_deviation = excluded.rating_deviation,
			rd_last_update_date = excluded.rd_last_update_date
	`;
	db.call(
		() =>
			db.transaction(() => {
				for (const e of entries) db.run(query, [e.user_id, e.leaderboard_id, e.elo, e.rating_deviation]); // prettier-ignore
			})(),
		`Error setting ${entries.length} leaderboard ratings`,
	);
}

/**
 * Gets the rating values for a player on a specific leaderboard.
 * @returns The player's leaderboard entry object or undefined if not found.
 * @throws If a database error occurs.
 */
function getPlayerRating(
	user_id: number,
	leaderboard_id: Leaderboard,
): Pick<LeaderboardEntry, 'elo' | 'rating_deviation' | 'rd_last_update_date'> | undefined {
	const query = `
		SELECT elo, rating_deviation, rd_last_update_date
		FROM leaderboards
		WHERE user_id = ? AND leaderboard_id = ?
	`;
	return db.call(
		() => db.get(query, [user_id, leaderboard_id]),
		`Error getting leaderboard rating for user "${user_id}" on leaderboard "${leaderboard_id}"`,
	);
}

/**
 * Retrieves all entries of the leaderboards table.
 * @throws If a database error occurs.
 */
function getAll(): LeaderboardEntry[] {
	return db.call(
		() => db.all<LeaderboardEntry>('SELECT * FROM leaderboards'),
		'Error retrieving all leaderboard entries',
	);
}

/**
 * Gets the top N players for a specific leaderboard by elo, starting from a given rank.
 * @param leaderboard_id - The id for the specific leaderboard.
 * @param start_rank - The 1-based rank to start from (e.g. 1 = top player, 2 = second-best, etc.)
 * @param n_players - The maximum number of players to retrieve, starting from start_rank
 * @param max_rd - Players with a rating deviation above this are left off the leaderboard.
 * @returns An array of top player leaderboard entries, potentially empty.
 * @throws If the database query fails.
 */
function getTopPlayers(
	leaderboard_id: Leaderboard,
	start_rank: number,
	n_players: number,
	max_rd: number,
): Pick<LeaderboardEntry, 'user_id' | 'elo'>[] {
	const offset = Math.max(0, start_rank - 1); // SQL OFFSET is 0-based
	const query = `
		SELECT user_id, elo
		FROM leaderboards
		WHERE leaderboard_id = ?
		AND rating_deviation <= ?
		ORDER BY elo DESC
		LIMIT ? OFFSET ?
	`;
	return db.call(
		() =>
			db.all<Pick<LeaderboardEntry, 'user_id' | 'elo'>>(query, [
				leaderboard_id,
				max_rd,
				n_players,
				offset,
			]),
		`Error getting top "${n_players}" players starting at rank "${start_rank}" for leaderboard "${leaderboard_id}"`,
	);
}

/**
 * Gets the rank (position) of a specific user within a specific leaderboard based on Elo.
 * Rank 1 is the highest Elo. Uses RANK() to handle ties (tied players share the same rank,
 * but the next rank number is skipped, creating potential gaps, e.g., 1, 1, 3).
 * @param user_id - The ID of the user whose rank is needed.
 * @param leaderboard_id - The ID of the leaderboard to check.
 * @param max_rd - Other players with a rating deviation above this are left off the leaderboard.
 * @returns The user's rank (1-based) as a number, or undefined if the user is not found
 *          on that leaderboard.
 * @throws If a database error occurs.
 */
function getPlayerRank(
	user_id: number,
	leaderboard_id: Leaderboard,
	max_rd: number,
): number | undefined {
	const query = `
		WITH RankedPlayers AS (
			SELECT
				user_id,
				RANK() OVER (ORDER BY elo DESC) as rank
			FROM leaderboards
			WHERE leaderboard_id = ? -- Filter for the specific leaderboard FIRST
			AND (rating_deviation <= ? OR user_id = ?)
		)
		SELECT rank
		FROM RankedPlayers
		WHERE user_id = ?; -- Then find the rank for the specific user
	`;
	const result = db.call(
		() => db.get<{ rank: number }>(query, [leaderboard_id, max_rd, user_id, user_id]),
		`Error getting rank for user "${user_id}" on leaderboard "${leaderboard_id}"`,
	);
	return result?.rank;
}

// Exports ---------------------------------------------------------------------

export default {
	setPlayerRatings,
	getPlayerRating,
	getAll,
	getTopPlayers,
	getPlayerRank,
};
