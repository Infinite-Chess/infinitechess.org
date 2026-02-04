// src/server/database/leaderboardsManager.ts

/**
 * This script handles queries to the leaderboards table.
 */

import type { RunResult } from 'better-sqlite3'; // Import necessary types

import type { Leaderboard } from '../../shared/chess/variants/validleaderboard.js';

import db from './database.js';
import { getTrueRD } from '../game/gamemanager/ratingcalculation.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import {
	DEFAULT_LEADERBOARD_ELO,
	DEFAULT_LEADERBOARD_RD,
	UNCERTAIN_LEADERBOARD_RD,
	RD_UPDATE_FREQUENCY,
} from '../game/gamemanager/ratingcalculation.js';

// Type Definitions -----------------------------------------------------------------------------------

/** Structure of a leaderboard entry record for a user. */
interface LeaderboardEntry {
	user_id?: number;
	leaderboard_id?: number;
	elo?: number;
	rating_deviation?: number;
	rd_last_update_date?: string | null; // Can be null if no games played yet
	// Consider adding volatility if you use it in Glicko-2
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason?: string };

/** A rating value and whether we are confident about it. */
type Rating = { value: number; confident: boolean };

// Methods --------------------------------------------------------------------------------------------

/**
 * The core logic for adding a user to a leaderboard.
 * This function is "unsafe" as it throws errors on failure, making it
 * suitable for use inside a database transaction.
 * @throws {SqliteError} If the database query fails. The error's `code` property
 *                       can be checked for specific constraints like 'SQLITE_CONSTRAINT_PRIMARYKEY'.
 */
function addUserToLeaderboard_core(
	user_id: number,
	leaderboard_id: Leaderboard,
	elo: number,
	rd: number,
): RunResult {
	const query = `
	INSERT INTO leaderboards (
		user_id,
		leaderboard_id,
		elo,
		rating_deviation
		-- rd_last_update_date will be NULL by default
	) VALUES (?, ?, ?, ?)
	`;
	// This will throw on failure, which is what we want for a transaction.
	return db.run(query, [user_id, leaderboard_id, elo, rd]);
}

/**
 * Safely adds a user entry to a specific leaderboard.
 * This wraps the core logic in a try/catch block, making it safe for standalone use.
 * @returns A result object indicating success or failure.
 */
function addUserToLeaderboard(
	user_id: number,
	leaderboard_id: Leaderboard,
	elo: number = DEFAULT_LEADERBOARD_ELO,
	rd: number = DEFAULT_LEADERBOARD_RD,
): ModifyQueryResult {
	try {
		const result = addUserToLeaderboard_core(user_id, leaderboard_id, elo, rd);
		return { success: true, result };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error adding user "${user_id}" to leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);

		let reason = 'Failed to add user to leaderboard.';
		if (error instanceof Error && 'code' in error) {
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = 'User ID does not exist in the members table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = `User ID already exists on this leaderboard.`;
			}
		}
		return { success: false, reason };
	}
}

/**
 * The core logic for updating a player's rating.
 * This function is "unsafe" as it throws errors on failure, making it
 * suitable for use inside a database transaction which can catch the
 * error and roll back.
 * @throws {Error} If the user is not found or if the database query fails.
 */
function updatePlayerLeaderboardRating_core(
	user_id: number,
	leaderboard_id: Leaderboard,
	elo: number,
	rd: number,
): RunResult {
	const query = `
	UPDATE leaderboards
	SET elo = ?,
	    rating_deviation = ?,
		rd_last_update_date = CURRENT_TIMESTAMP -- Automatically update timestamp on rating change
	WHERE user_id = ? AND leaderboard_id = ?
	`;
	const result = db.run(query, [elo, rd, user_id, leaderboard_id]);

	// If the UPDATE affected no rows, it's a critical failure for a transaction.
	// We must throw an error to trigger a rollback.
	if (result.changes === 0) {
		throw new Error(
			`User with ID "${user_id}" not found on leaderboard "${leaderboard_id}" for update.`,
		);
	}
	return result;
}

/**
 * Safely updates the rating values for a player on a specific leaderboard.
 * This wraps the core logic in a try/catch block, making it safe for
 * standalone use, such as in background jobs or admin tools.
 * @returns A result object indicating success or failure.
 */
function updatePlayerLeaderboardRating(
	user_id: number,
	leaderboard_id: Leaderboard,
	elo: number,
	rd: number,
): ModifyQueryResult {
	try {
		const result = updatePlayerLeaderboardRating_core(user_id, leaderboard_id, elo, rd);
		return { success: true, result };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error modifying leaderboard ratings data for user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);
		return { success: false, reason: message };
	}
}

/**
 * Checks if a player exists on a specific leaderboard.
 * Relies on the composite primary key (user_id, leaderboard_id).
 * @param user_id - The ID of the user to check.
 * @param leaderboard_id - The ID of the leaderboard to check within.
 * @returns True if the player exists on the specified leaderboard, false otherwise (including on error).
 */
function isPlayerInLeaderboard(user_id: number, leaderboard_id: Leaderboard): boolean {
	// Query to select a constant '1' if a matching row exists.
	// LIMIT 1 ensures the database can stop searching after finding the first match.
	// This is efficient, especially with the primary key index.
	const query = `
        SELECT 1
        FROM leaderboards
        WHERE user_id = ? AND leaderboard_id = ?
        LIMIT 1;
    `;

	try {
		const result = db.get<{ '1': 1 }>(query, [user_id, leaderboard_id]);

		// If db.get returns anything (even an object like { '1': 1 }), it means a row was found.
		// If no row is found, db.get returns undefined.
		// The double negation (!!) converts a truthy value (the result object) to true,
		// and a falsy value (undefined) to false.
		return !!result;
	} catch (error: unknown) {
		// Log any potential database errors during the check
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error checking existence of user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);

		// On error, we cannot confirm existence, so return false.
		return false;
	}
}

/** The return type of {@link getPlayerLeaderboardRating} */
type PlayerLeaderboardRating = {
	elo: number;
	rating_deviation: number;
	rd_last_update_date: string | null; // Can be null if no games played yet
};

/**
 * The core logic for getting a player's rating. Throws on failure.
 * @throws {SqliteError} If the database query fails.
 */
function getPlayerLeaderboardRating_core(
	user_id: number,
	leaderboard_id: Leaderboard,
): PlayerLeaderboardRating | undefined {
	const query = `
		SELECT elo, rating_deviation, rd_last_update_date
		FROM leaderboards
		WHERE user_id = ? AND leaderboard_id = ?
	`;
	// This will throw an error if the query fails.
	return db.get<PlayerLeaderboardRating>(query, [user_id, leaderboard_id]);
}

/**
 * Safely gets the rating values for a player on a specific leaderboard.
 * This wraps the core logic in a try/catch block to prevent crashes.
 * @returns The player's leaderboard entry object or undefined if not found or on error.
 */
function getPlayerLeaderboardRating(
	user_id: number,
	leaderboard_id: Leaderboard,
): PlayerLeaderboardRating | undefined {
	try {
		return getPlayerLeaderboardRating_core(user_id, leaderboard_id);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEventsAndPrint(
			`Error getting leaderboard rating data for member "${user_id}" on leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);
		return undefined;
	}
}

/**
 * Gets all leaderboard entries for a specific user.
 * @param user_id - The id for the user
 * @returns An array of the user's leaderboard entries across all leaderboards, potentially empty.
 */
function getAllUserLeaderboardEntries(user_id: number): LeaderboardEntry[] {
	// New function leveraging the idx_leaderboards_user index
	const query = `
        SELECT leaderboard_id, elo, rating_deviation, rd_last_update_date
        FROM leaderboards
        WHERE user_id = ?
        ORDER BY leaderboard_id ASC -- Optional: order for consistency
    `;

	try {
		const entries = db.all(query, [user_id]) as LeaderboardEntry[];
		return entries;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error getting all leaderboard entries for user "${user_id}": ${message}`,
			'errLog.txt',
		);
		return []; // Return an empty array on error
	}
}

/**
 * Gets the top N players for a specific leaderboard by elo, starting from a given rank.
 * @param leaderboard_id - The id for the specific leaderboard.
 * @param start_rank - The 1-based rank to start from (e.g. 1 = top player, 2 = second-best, etc.)
 * @param n_players - The maximum number of players to retrieve, starting from start_rank
 * @returns An array of top player leaderboard entries, potentially empty.
 */
function getTopPlayersForLeaderboard(
	leaderboard_id: Leaderboard,
	start_rank: number,
	n_players: number,
): LeaderboardEntry[] {
	// Changed table name, column names, ORDER BY column, added WHERE clause for leaderboard_id
	const offset = Math.max(0, start_rank - 1); // SQL OFFSET is 0-based

	const query = `
		SELECT user_id, elo, rating_deviation, rd_last_update_date
		FROM leaderboards
		WHERE leaderboard_id = ?
		AND rating_deviation <= ? -- Disregard any members with a too high RD
		ORDER BY elo DESC
		LIMIT ? OFFSET ?
	`;

	try {
		// Execute the query with leaderboard_id, n_players and offset parameters
		// Added leaderboard_id to parameters
		const top_players = db.all(query, [
			leaderboard_id,
			UNCERTAIN_LEADERBOARD_RD,
			n_players,
			offset,
		]) as LeaderboardEntry[];
		return top_players; // Returns an array (potentially empty)
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Updated log message
		logEventsAndPrint(
			`Error getting top "${n_players}" players starting at rank "${start_rank}" for leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);
		return []; // Return an empty array on error
	}
}

/**
 * Gets the rank (position) of a specific user within a specific leaderboard based on Elo.
 * Rank 1 is the highest Elo. Uses RANK() to handle ties (tied players share the same rank,
 * but the next rank number is skipped, creating potential gaps, e.g., 1, 1, 3).
 * @param user_id - The ID of the user whose rank is needed.
 * @param leaderboard_id - The ID of the leaderboard to check.
 * @returns The user's rank (1-based) as a number, or undefined if the user is not found
 *          on that leaderboard or if an error occurs.
 */
function getPlayerRankInLeaderboard(
	user_id: number,
	leaderboard_id: Leaderboard,
): number | undefined {
	// This query uses a Common Table Expression (CTE) and the RANK window function.
	// 1. Filter `leaderboards` to only include rows for the specific `leaderboard_id`.
	// 2. Calculate `RANK() OVER (ORDER BY elo DESC)`.
	//    RANK assigns the same rank to ties, but skips subsequent ranks
	//    (e.g., if 2 players tie for 1st, the next rank is 3).
	// 3. Select the calculated `rank` for the specific `user_id`.
	const query = `
		WITH RankedPlayers AS (
			SELECT
				user_id,
				RANK() OVER (ORDER BY elo DESC) as rank
			FROM leaderboards
			WHERE leaderboard_id = ? -- Filter for the specific leaderboard FIRST
			AND (rating_deviation <= ? OR user_id = ?) -- Disregard any other users with a too high RD
		)
		SELECT rank
		FROM RankedPlayers
		WHERE user_id = ?; -- Then find the rank for the specific user
	`;

	try {
		// Execute the query, expecting at most one row containing the rank
		const result = db.get<{ rank: number }>(query, [
			leaderboard_id,
			UNCERTAIN_LEADERBOARD_RD,
			user_id,
			user_id,
		]);

		// If a result is found, return the rank, otherwise return undefined
		return result?.rank;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log message remains appropriate
		logEventsAndPrint(
			`Error getting rank for user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`,
			'errLog.txt',
		);
		return undefined; // Return undefined on error
	}
}

// Helper Functions ----------------------------------------------------------------------------------

/**
 * Returns the elo of a player on a specific leaderboard, or their elo if they were
 * to join it now, and whether we are confident about it.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard.
 * @returns The player's leaderboard elo and whether we are confident about it.
 */
function getEloOfPlayerInLeaderboard(user_id: number, leaderboard_id: Leaderboard): Rating {
	const rating_values = getPlayerLeaderboardRating(user_id, leaderboard_id); // { user_id, elo, rating_deviation, rd_last_update_date } | undefined
	if (!rating_values) return { value: DEFAULT_LEADERBOARD_ELO, confident: false }; // No rating, return un-confident default elo

	const confident = rating_values.rating_deviation <= UNCERTAIN_LEADERBOARD_RD;
	return { value: rating_values.elo!, confident };
}

// Regular Table Utility Functions -------------------------------------------------------------------

/** Calls updateAllRatingDeviationsofLeaderboardTable() every {@link RD_UPDATE_FREQUENCY} milliseconds */
function startPeriodicLeaderboardRatingDeviationUpdate(): void {
	setInterval(updateAllRatingDeviationsofLeaderboardTable, RD_UPDATE_FREQUENCY);
}

/**
 * Retrieves all entries of the leaderboards table and updates their RD
 */
function updateAllRatingDeviationsofLeaderboardTable(): void {
	const query = `SELECT * FROM leaderboards`;

	try {
		const entries = db.all(query) as LeaderboardEntry[];
		for (const entry of entries) {
			const updatedRD = getTrueRD(
				entry.rating_deviation!,
				entry?.rd_last_update_date ?? null,
			);
			updatePlayerLeaderboardRating(
				entry.user_id!,
				entry.leaderboard_id! as Leaderboard,
				entry.elo!,
				updatedRD,
			);
		}
		logEventsAndPrint(
			`Finished updating all rating deviations in leaderboard table.`,
			'leaderboardLog.txt',
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error updating all rating deviations in leaderboard table: ${message}`,
			'errLog.txt',
		);
	}
}

// Exports --------------------------------------------------------------------------------------------

// Updated export names to be more descriptive
export {
	addUserToLeaderboard,
	addUserToLeaderboard_core,
	updatePlayerLeaderboardRating,
	updatePlayerLeaderboardRating_core,
	isPlayerInLeaderboard,
	getPlayerLeaderboardRating,
	getPlayerLeaderboardRating_core,
	getAllUserLeaderboardEntries, // Added export for the new function
	getTopPlayersForLeaderboard,
	getPlayerRankInLeaderboard,
	getEloOfPlayerInLeaderboard,
	startPeriodicLeaderboardRatingDeviationUpdate,
};

export type { Rating };
