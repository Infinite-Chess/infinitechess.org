// src/server/database/playerStatsManager.ts

/**
 * This script handles queries to the player stats table.
 */

import jsutil from '../../shared/util/jsutil.js';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import { allPlayerStatsColumns } from './databaseTables.js';

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

// Methods --------------------------------------------------------------------------------------------

/**
 * Fetches specified columns of a single player from the player_stats table based on user_id
 * @param user_id - The user_id of the player
 * @param columns - The columns to retrieve (e.g., ['user_id', 'moves_played', 'game_count'])
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function _getPlayerStatsData(user_id: number, columns: string[]): PlayerStatsRecord | undefined {
	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(
			`When getting player_stats data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return undefined;
	}
	if (
		!columns.every(
			(column) => typeof column === 'string' && allPlayerStatsColumns.includes(column),
		)
	) {
		logEventsAndPrint(
			`Invalid columns requested from player_stats table: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
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
		logEventsAndPrint(
			`Error executing query when gettings player stats of user_id ${user_id}: ${message}. The query: "${query}"`,
			'errLog.txt',
		);
		return undefined;
	}
}

// Exports --------------------------------------------------------------------------------------------
