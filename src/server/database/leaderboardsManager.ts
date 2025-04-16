/**
 * This script handles queries to the leaderboards table.
 */

// @ts-ignore
import { logEvents } from '../middleware/logEvents.js'; // Adjust path if needed
// @ts-ignore
import db from './database.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a leaderboard entry record for a user. */
interface LeaderboardEntry {
	user_id?: number;
	leaderboard_id?: number;
	elo?: number;
	rating_deviation?: number;
	last_rated_game_date?: string | null; // Can be null if no games played yet
	// Consider adding volatility if you use it in Glicko-2
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason?: string };

/** Default elo for a player not contained in a leaderboard. We use the same default across the leaderboards, to avoid confusion. */
const DEFAULT_LEADERBOARD_ELO = 1000;

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
	'Classical+': Leaderboards.INFINITY,
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


// Methods --------------------------------------------------------------------------------------------


/**
 * Adds a user entry to a specific leaderboard, defaulting to 1000 elo and 350 rd.
 * @param user_id - The id for the user (fails if it doesn't exist in members or due to constraints)
 * @param leaderboard_id - The id for the specific leaderboard.
 * @returns A result object indicating success or failure.
 */
function addUserToLeaderboard(user_id: number, leaderboard_id: Leaderboard): ModifyQueryResult {
	// Changed table name, added leaderboard_id column
	const query = `
	INSERT INTO leaderboards (
		user_id,
		leaderboard_id
		-- elo and rating_deviation will use DB defaults
		-- last_rated_game_date will be NULL by default
	) VALUES (?, ?)
	`;

	try {
		// Execute the query with the provided values
		// Added leaderboard_id to parameters
		const result = db.run(query, [user_id, leaderboard_id]);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Updated log message
		logEvents(`Error adding user "${user_id}" to leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		let reason = 'Failed to add user to ratings table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = 'User ID does not exist in the members table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				// Now checks the composite primary key
				reason = `User ID already exists on leaderboard.`;
			}
		}
		return { success: false, reason };
	}
}

/**
 * Updates the rating values for a player on a specific leaderboard.
 * Also updates the last_rated_game_date to the current time.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard.
 * @param elo - The new elo value for the player
 * @param rd - The new rating deviation for the player
 * @returns A result object indicating success or failure.
 */
function updatePlayerLeaderboardRating(user_id: number, leaderboard_id: Leaderboard, elo: number, rd: number): ModifyQueryResult {
	// Changed table name, column names, added leaderboard_id to WHERE, added last_rated_game_date update
	const query = `
	UPDATE leaderboards
	SET elo = ?,
	    rating_deviation = ?,
		last_rated_game_date = CURRENT_TIMESTAMP -- Automatically update timestamp on rating change
	WHERE user_id = ? AND leaderboard_id = ?
	`;
	try {
		// Execute the query, added leaderboard_id to parameters
		const result = db.run(query, [elo, rd, user_id, leaderboard_id]);

		// Check if any row was actually updated
		if (result.changes === 0) {
			// Updated reason message
			const reason = `User with ID "${user_id}" not found on leaderboard "${leaderboard_id} for update.`;
			logEvents(reason, 'errLog.txt', { print: false }); // Log quietly
			return { success: false, reason };
		}

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEvents(`Error modifying leaderboard ratings data for user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false, reason: `Database error updating ratings for user ${user_id} on leaderboard ${leaderboard_id}.` };
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
		const result = db.get(query, [user_id, leaderboard_id]);

		// If db.get returns anything (even an object like { '1': 1 }), it means a row was found.
		// If no row is found, db.get returns undefined.
		// The double negation (!!) converts a truthy value (the result object) to true,
		// and a falsy value (undefined) to false.
		return !!result;

	} catch (error: unknown) {
		// Log any potential database errors during the check
		const message = error instanceof Error ? error.message : String(error);
		logEvents(`Error checking existence of user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });

		// On error, we cannot confirm existence, so return false.
		return false;
	}
}

/**
 * Gets the rating values for a player on a specific leaderboard.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard.
 * @returns The player's leaderboard entry object or undefined if not found or on error.
 */
function getPlayerLeaderboardRating(user_id: number, leaderboard_id: Leaderboard): LeaderboardEntry | undefined {
	// Changed table name, column names, added leaderboard_id to WHERE, selected new columns
	const query = `
		SELECT elo, rating_deviation, last_rated_game_date
		FROM leaderboards
		WHERE user_id = ? AND leaderboard_id = ?
	`;

	try {
		// Execute the query with user_id and leaderboard_id parameters
		// Added leaderboard_id to parameters
		const row = db.get(query, [user_id, leaderboard_id]) as LeaderboardEntry | undefined;
		return row; // Returns the record or undefined if not found
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error getting leaderboard rating data for member "${user_id}" on leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });
		return undefined; // Return undefined on error
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
        SELECT leaderboard_id, elo, rating_deviation, last_rated_game_date
        FROM leaderboards
        WHERE user_id = ?
        ORDER BY leaderboard_id ASC -- Optional: order for consistency
    `;

	try {
		const entries = db.all(query, [user_id]) as LeaderboardEntry[];
		return entries;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEvents(`Error getting all leaderboard entries for user "${user_id}": ${message}`, 'errLog.txt', { print: true });
		return []; // Return an empty array on error
	}
}

/**
 * Gets the top N players for a specific leaderboard by elo.
 * @param leaderboard_id - The id for the specific leaderboard.
 * @param n_players - The maximum number of top players to retrieve
 * @returns An array of top player leaderboard entries, potentially empty.
 */
function getTopPlayersForLeaderboard(leaderboard_id: Leaderboard, n_players: number): LeaderboardEntry[] {
	// Changed table name, column names, ORDER BY column, added WHERE clause for leaderboard_id
	const query = `
		SELECT user_id, elo, rating_deviation, last_rated_game_date
		FROM leaderboards
		WHERE leaderboard_id = ?
		ORDER BY elo DESC
		LIMIT ?
	`;

	try {
		// Execute the query with leaderboard_id and n_players parameters
		// Added leaderboard_id to parameters
		const top_players = db.all(query, [leaderboard_id, n_players]) as LeaderboardEntry[];
		return top_players; // Returns an array (empty if no players or n_players <= 0)
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Updated log message
		logEvents(`Error getting top "${n_players}" players for leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });
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
function getPlayerRankInLeaderboard(user_id: number, leaderboard_id: Leaderboard): number | undefined {
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
		)
		SELECT rank
		FROM RankedPlayers
		WHERE user_id = ?; -- Then find the rank for the specific user
	`;

	try {
		// Execute the query, expecting at most one row containing the rank
		const result = db.get(query, [leaderboard_id, user_id]) as { rank: number } | undefined;

		// If a result is found, return the rank, otherwise return undefined
		return result?.rank;

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log message remains appropriate
		logEvents(`Error getting rank for user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt', { print: true });
		return undefined; // Return undefined on error
	}
}


// Helper Functions ----------------------------------------------------------------------------------


/**
 * Gets a string containing the display value for the rating of a player on a specific leaderboard.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard.
 * @returns The player's leaderboard display string
 */
function getDisplayEloOfPlayerInLeaderboard(user_id: number, leaderboard_id: Leaderboard): string {
	let ranked_elo = `${String(DEFAULT_LEADERBOARD_ELO)}?`; // Fallback if they aren't in the leaderboard
	const rating_values = getPlayerLeaderboardRating(user_id, leaderboard_id); // { user_id, elo, rating_deviation, last_rated_game_date } | undefined
	if (rating_values?.elo !== undefined) ranked_elo = String(Math.round(rating_values.elo));

	return ranked_elo;
}

/**
 * Returns the leaderboard a variant is a part of, if it's a part of one.
 * This can be used to ask if we are allowed to play ranked on that variant.
 */
function getLeaderboardOfVariant(variant: string): Leaderboard | undefined {
	return VariantLeaderboards[variant] as Leaderboard | undefined;
}


// Exports --------------------------------------------------------------------------------------------


// Updated export names to be more descriptive
export {
	Leaderboards,
	VariantLeaderboards,
	addUserToLeaderboard,
	updatePlayerLeaderboardRating,
	isPlayerInLeaderboard,
	getPlayerLeaderboardRating,
	getAllUserLeaderboardEntries, // Added export for the new function
	getTopPlayersForLeaderboard,
	getPlayerRankInLeaderboard,
	getDisplayEloOfPlayerInLeaderboard
};