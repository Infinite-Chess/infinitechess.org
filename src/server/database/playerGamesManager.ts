/**
 * This script handles queries to the player_games table. 
 */

import jsutil from '../../client/scripts/esm/util/jsutil.js';
// @ts-ignore
import { logEvents } from '../middleware/logEvents.js'; // Adjust path if needed
// @ts-ignore
import db from './database.js';
// @ts-ignore
import { allPlayerGamesColumns } from './databaseTables.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types
import type { Player } from '../../client/scripts/esm/chess/util/typeutil.js';


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a player_games record. This is all allowed columns of a (user_id, game_id). */
interface PlayerGamesRecord {
	user_id?: number;
	game_id?: number;
	player_number?: Player;
	elo_at_game?: number | null;
	elo_change_from_game?: number | null;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason: string };


// Methods --------------------------------------------------------------------------------------------

/**
 * Adds an entry to the player_games table
 * @param [options] - Parameters for all the entries of the game
 * @returns A result object indicating success or failure.
 */
function addGameToPlayerGamesTable(
	options: {
		user_id: number,
		game_id: number,
		player_number: Player,
		elo_at_game: number | null,
		elo_change_from_game: number | null,
	}): ModifyQueryResult {

	const query = `
	INSERT INTO player_games (
		user_id,
		game_id,
		player_number,
		elo_at_game,
		elo_change_from_game
	) VALUES (?, ?, ?, ?, ?)
	`;

	try {
		// Execute the query with the provided values
		const result = db.run(query,
			[
				options.user_id,
				options.game_id,
				options.player_number,
				options.elo_at_game,
				options.elo_change_from_game
			]
		);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error adding user game to player_games table for user "${options.user_id}" and game "${options.game_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		// Check for specific constraint errors if possible (e.g., FOREIGN KEY failure)
		let reason = 'Failed to add game to player_games table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = 'User ID does not exist in the members table or Game ID does not exist in the games table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = '(User ID, Game ID) already exists in the player_games table.';
			}
		}
		return { success: false, reason };
	}
}

/**
 * Fetches specified columns of a single (user_id, game_id) from the player_games table based on (user_id, game_id)
 * @param user_id - The user_id of the player
 * @param game_id - The game_id of the game
 * @param columns - The columns to retrieve (e.g., ['user_id', 'player_number'])
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function getPlayerGamesData(user_id: number, game_id: number, columns: string[]): PlayerGamesRecord | undefined {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEvents(`When getting player_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allPlayerGamesColumns.includes(column))) {
		logEvents(`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM player_games WHERE user_id = ? AND game_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get(query, [user_id, game_id]) as PlayerGamesRecord | undefined;

		// If no row is found, return undefined
		if (!row) {
			logEvents(`No matches found in player_games table for user_id = ${user_id} and game_id = ${game_id}.`, 'errLog.txt', { print: true });
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEvents(`Error executing query when gettings player game of user_id ${user_id} and game_id = ${game_id}: ${message}. The query: "${query}"`, 'errLog.txt', { print: true });
		return undefined;
	}
}

/**
 * Gets all player_games entries for all members logged for a specific game, in order of player_number.
 * @param game_id - The game_id of the game
 * @returns - an array of PlayerGamesRecord information about the members in a game
 */
function getPlayersInGame(game_id: number): PlayerGamesRecord[] {

	// Construct SQL query
	const query = `
		SELECT user_id, player_number, elo_at_game, elo_change_from_game
		FROM player_games
		WHERE game_id = ?
		ORDER BY player_number ASC -- Optional: order for consistency
	`;

	try {
		const entries = db.all(query, [game_id]) as PlayerGamesRecord[];
		return entries;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEvents(`Error getting all player_games entries for game "${game_id}": ${message}`, 'errLog.txt', { print: true });
		return []; // Return an empty array on error
	}
}


/**
 * Updates multiple column values in the player_games table for a given user.
 * 
 * Maybe useful to have? SHOULD NEVER BE USED THOUGH EXCEPT FOR EXTREME CIRCUMSTANCES.
 * All added games should have correct values from the start.
 * 
 * @param user_id - The user ID of the player_games.
 * @param game_id - The game_id of the game
 * @param columnsAndValues - An object containing column-value pairs to update.
 * @returns - A result object indicating success or failure.
 */
// eslint-disable-next-line no-unused-vars
function updatePlayerGamesColumns(user_id: number, game_id: number, columnsAndValues: PlayerGamesRecord): ModifyQueryResult {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		logEvents(`Invalid or empty columns and values provided for user ID "${user_id}" and game ID "${game_id}" when updating player_games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
		return { success: false, reason: 'Invalid arguments.' }; // Generic error message
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allPlayerGamesColumns.includes(column)) {
			logEvents(`Invalid column "${column}" provided for user ID "${user_id}" and game ID "${game_id}" when updating player_games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
			return { success: false, reason: 'Invalid column.' }; // Generic error message
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the user_id and game_id as the last parameters for the WHERE clause
	values.push(user_id);
	values.push(game_id);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE player_games SET ${setStatements} WHERE user_id = ? AND game_id = ?`;

	try {
		// Execute the update query
		const result = db.run(updateQuery, values);

		// Check if the update was successful
		if (result.changes > 0) return { success: true, result };
		else {
			logEvents(`No changes made when updating player_games table columns ${JSON.stringify(columnsAndValues)} for game in player_games table with user ID "${user_id}" and game ID "${game_id}"! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true });
			return { success: false, reason: 'No changes made.' }; // Generic error message
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error updating player_games table columns ${JSON.stringify(columnsAndValues)} for user ID "${user_id}" and game ID "${game_id}": ${message}! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true });
		// Return an error message
		return { success: false, reason: 'Database error.' }; // Generic error message
	}
}


// Exports --------------------------------------------------------------------------------------------


export {
	addGameToPlayerGamesTable,
	getPlayerGamesData,
	getPlayersInGame,
	// Commented out to emphasize this should not ever have to be used:
	// updatePlayerGamesColumns,
};	
