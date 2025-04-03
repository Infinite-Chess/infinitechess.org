/**
 * This script handles queries to the ratings table. 
 */

// @ts-ignore
import { logEvents } from '../middleware/logEvents.js'; // Adjust path if needed
// @ts-ignore
import db from './database.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a rating record. This is all columns of a user_id. */
interface RatingRecord {
	user_id: number;
	/** The elo rating of the player in all infinite and similar variants. */
	infinite_elo: number;
	/** The rating deviation of the player in all infinite and similar variants. */
	infinite_rating_deviation: number;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason?: string };


// Methods --------------------------------------------------------------------------------------------


/**
 * Adds an entry to the ratings table, defaulting to 1000 elo and 350 rd (assuming DB defaults)
 * @param user_id - The id for the user (fails if it doesn't exist in members or due to constraints)
 * @returns A result object indicating success or failure.
 */
function addUserToRatingsTable(user_id: number): ModifyQueryResult {
	const query = `
	INSERT INTO ratings (
		user_id
	) VALUES (?)
	`; // Only inserting user_id is needed if others have DB defaults

	try {
		// Execute the query with the provided values
		const result = db.run(query, [user_id]);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error adding user to ratings table "${user_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		// Check for specific constraint errors if possible (e.g., FOREIGN KEY failure)
		let reason = 'Failed to add user to ratings table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = 'User ID does not exist in the members table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = 'User ID already exists in the ratings table.';
			}
		}
		return { success: false, reason };
	}
}

/**
 * Updates the values related to the rating of the player.
 * @param user_id - The id for the user
 * @param elo - The new elo value for the player
 * @param rd - The new rating deviation for the player
 * @returns A result object indicating success or failure.
 */
function updatePlayerRatingValues(user_id: number, elo: number, rd: number): ModifyQueryResult {
	const query = `
	UPDATE ratings
	SET infinite_elo = ?, infinite_rating_deviation = ?
	WHERE user_id = ?
	`;
	try {
		// Execute the query
		const result = db.run(query, [elo, rd, user_id]);

		// Check if any row was actually updated
		if (result.changes === 0) {
			const reason = `User with ID "${user_id}" not found in ratings table for update.`;
			logEvents(reason, 'errLog.txt', { print: false }); // Log quietly
			return { success: false, reason };
		}

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error modifying user ratings data for user "${user_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false, reason: `Database error updating ratings for user ${user_id}.` };
	}
}

/**
 * Gets the values related to the rating of the player.
 * @param user_id - The id for the user
 * @returns The player's rating record object or undefined if not found or on error.
 * */
function getPlayerRatingValues(user_id: number): RatingRecord | undefined {
	// SQL query to select specific rating columns for a user
	const query = 'SELECT user_id, infinite_elo, infinite_rating_deviation FROM ratings WHERE user_id = ?';

	try {
		// Execute the query with the user_id parameter
		const row = db.get(query, [user_id]) as RatingRecord | undefined;
		return row; // Returns the record or undefined if not found
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error getting rating data for member "${user_id}": ${message}`, 'errLog.txt', { print: true });
		return undefined; // Return undefined on error
	}
}

/**
 * Gets the top N players by elo.
 * @param n_players - The maximum number of top players to retrieve
 * @returns An array of top player rating records, potentially empty.
 */
function getNTopPlayersRatingValues(n_players: number): RatingRecord[] {
	// Select specific columns, order by elo descending, limit to n_players
	const query = 'SELECT user_id, infinite_elo, infinite_rating_deviation FROM ratings ORDER BY infinite_elo DESC LIMIT ?';

	try {
		// Execute the query with the n_players parameter
		const top_players = db.all(query, [n_players]) as RatingRecord[];
		return top_players; // Returns an array (empty if no players or n_players <= 0)
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error getting top "${n_players}" players: ${message}`, 'errLog.txt', { print: true });
		return []; // Return an empty array on error
	}
}


// Exports --------------------------------------------------------------------------------------------


export {
	addUserToRatingsTable,
	updatePlayerRatingValues,
	getPlayerRatingValues,
	getNTopPlayersRatingValues,
};	
