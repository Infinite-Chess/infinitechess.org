
// src/server/database/playerStatsManager.ts

/**
 * This script handles queries to the player stats table. 
 */

import jsutil from '../../client/scripts/esm/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import db from './database.js';
import { allPlayerStatsColumns } from './databaseTables.js';

import type { RunResult, SqliteError } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a player_stats record. This is all allowed columns of a user_id. */
interface PlayerStatsRecord {
	user_id?: number;
    moves_played?: number;
    game_count?: number;
    game_count_rated?: number;
    game_count_casual?: number;
    game_count_public?: number;
    game_count_private?: number;
    game_count_wins?: number;
    game_count_losses?: number;
    game_count_draws?: number;
	game_count_aborted?: number;
    game_count_wins_rated?: number;
    game_count_losses_rated?: number;
    game_count_draws_rated?: number;
    game_count_wins_casual?: number;
    game_count_losses_casual?: number;
    game_count_draws_casual?: number;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason: string };


// Methods --------------------------------------------------------------------------------------------


/**
 * Fetches specified columns of a single player from the player_stats table based on user_id
 * @param user_id - The user_id of the player
 * @param columns - The columns to retrieve (e.g., ['user_id', 'moves_played', 'game_count'])
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function getPlayerStatsData(user_id: number, columns: string[]): PlayerStatsRecord | undefined {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When getting player_stats data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allPlayerStatsColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from player_stats table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM player_stats WHERE user_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get<PlayerStatsRecord>(query, [user_id]);

		// If no row is found, return undefined
		if (!row) {
			// Don't log, it's fine if they request stats from a deleted user.
			// logEventsAndPrint(`No matches found in player stats table for user_id = ${user_id}.`, 'errLog.txt');
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEventsAndPrint(`Error executing query when gettings player stats of user_id ${user_id}: ${message}. The query: "${query}"`, 'errLog.txt');
		return undefined;
	}
}

/**
 * [INTERNAL] Updates multiple column values in the player_stats table for a given user.
 * This function is "unsafe" as it throws errors on failure. It is intended
 * only for use within the atomic `logGame` transaction and is NOT exported.
 *
 * It assumes the orchestrator provides a valid, non-empty columnsAndValues object
 * and that all column names are correct.
 * @throws {SqliteError} If the database query fails.
 * @throws {Error} If the UPDATE operation affects 0 rows, indicating the user was not found.
 */
function updatePlayerStatsColumns_internal(user_id: number, columnsAndValues: PlayerStatsRecord): void {
	// Dynamically build the SET part of the query.
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the user_id as the last parameter for the WHERE clause.
	values.push(user_id);

	const updateQuery = `UPDATE player_stats SET ${setStatements} WHERE user_id = ?`;

	const result = db.run(updateQuery, values);

	// If the UPDATE affected no rows, it's a critical failure for a transaction.
	if (result.changes === 0) {
		throw new Error(`User with ID "${user_id}" not found in player_stats for update.`);
	}
	// No return value needed on success.
}


// Exports --------------------------------------------------------------------------------------------


export {
	getPlayerStatsData,
};	
