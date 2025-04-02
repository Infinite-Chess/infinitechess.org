/**
 * This script handles queries to the player stats table. 
 */

// @ts-ignore
import { logEvents } from '../middleware/logEvents.js'; // Adjust path if needed
// @ts-ignore
import { ensureJSONString } from '../utility/JSONUtils.js';
// @ts-ignore
import db from './database.js';

import { allPlayerStatsColumns } from './databaseTables.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a player_stats record. This is all allowed columns of a user_id. */
interface PlayerStatsRecord {
	user_id?: number;
	moves_played?: number;
    last_played_rated_game?: Date;
    game_history?: string;
    game_count?: number;
    game_count_rated?: number;
    game_count_casual?: number;
    game_count_public?: number;
    game_count_private?: number;
    game_count_wins?: number;
    game_count_losses?: number;
    game_count_draws?: number;
    game_count_wins_ranked?: number;
    game_count_losses_ranked?: number;
    game_count_draws_ranked?: number;
    game_count_wins_casual?: number;
    game_count_losses_casual?: number;
    game_count_draws_casual?: number;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason?: string };


// Methods --------------------------------------------------------------------------------------------


/*
 * Adds an entry to the player stats table
 * @param user_id - The id for the user (fails if it doesn't exist in player_stats or due to constraints)
 * @returns A result object indicating success or failure.
 */
function addUserToPlayerStatsTable(user_id: number): ModifyQueryResult {
	const query = `
	INSERT INTO player_stats (
		user_id,
        last_played_rated_game
	) VALUES (?, ?)
	`; // Only inserting user_id and last_played_rated_game is needed if others have DB defaults

	try {
		// Execute the query with the provided values
		const result = db.run(query, [user_id]);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error adding user to player_stats table "${user_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		// Check for specific constraint errors if possible (e.g., FOREIGN KEY failure)
		let reason = 'Failed to add user to player_stats table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = 'User ID does not exist in the player_stats table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = 'User ID already exists in the player_stats table.';
			}
		}
		return { success: false, reason };
	}
}

/**
 * Fetches specified columns of a single player_stats from the player_stats table based on user_id
 * @param {string[]} columns - The columns to retrieve (e.g., ['user_id', 'moves_played', 'last_played_rated_game']).
 * @param {number} user_id - The search key to use. Must be either 'user_id', 'username', or 'email'.
 * @returns {PlayerStatsRecord} - An object containing the requested columns, or undefined if no match is found.
 */
function getPlayerStatsData(columns: string[], user_id: number): PlayerStatsRecord | undefined {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEvents(`When getting player_stats data, columns must be an array of strings! Received: ${ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allPlayerStatsColumns.includes(column))) {
		logEvents(`Invalid columns requested from player_stats table: ${ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM player_stats WHERE user_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get(query, [user_id]) as PlayerStatsRecord | undefined;

		// If no row is found, return undefined
		if (!row) {
			logEvents(`No matches found for user_id = ${user_id}`, 'errLog.txt', { print: true });
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error) {
		// Log the error and return undefined
		logEvents(`Error executing query: ${error.message}`, 'errLog.txt', { print: true });
		return undefined;
	}
}

/**
 * Updates multiple column values in the player_stats table for a given user.
 * @param {number} user_id - The user ID of the player_stats.
 * @param {PlayerStatsRecord} columnsAndValues - An object containing column-value pairs to update.
 * @returns {ModifyQueryResult} - A result object indicating success or failure.
 */
function updatePlayerStatsColumns(user_id: number, columnsAndValues: PlayerStatsRecord): ModifyQueryResult {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		const reason = `Invalid or empty columns and values provided for user ID "${user_id}" when updating player_stats columns!`;
		logEvents(reason, 'errLog.txt', { print: true });
		return { success: false, reason };
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allPlayerStatsColumns.includes(column)) {
			const reason = `Invalid column "${column}" provided for user ID "${user_id}" when updating player_stats columns!`;
			logEvents(reason, 'errLog.txt', { print: true });
			return { success: false, reason };
		}
		// Convert objects (e.g., JSON) to strings for storage
		if (typeof columnsAndValues[column] === 'object' && columnsAndValues[column] !== null) {
			columnsAndValues[column] = JSON.stringify(columnsAndValues[column]);
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the user_id as the last parameter for the WHERE clause
	values.push(user_id);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE player_stats SET ${setStatements} WHERE user_id = ?`;

	try {
		// Execute the update query
		const result = db.run(updateQuery, values);

		// Check if the update was successful
		if (result.changes > 0) return { success: true, result };
		else {
			const reason = `No changes made when updating columns ${JSON.stringify(columnsAndValues)} for member in player_stats table with id "${user_id}"!`;
			logEvents(reason, 'errLog.txt', { print: true });
			return { success: false, reason };
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		const reason = `Error updating columns ${JSON.stringify(columnsAndValues)} for user ID "${user_id}": ${message}`;
		logEvents(reason, 'errLog.txt', { print: true });

		// Return an error message
		return { success: false, reason };
	}
}


// Exports --------------------------------------------------------------------------------------------


export {
	addUserToPlayerStatsTable,
	getPlayerStatsData,
	updatePlayerStatsColumns
};	
