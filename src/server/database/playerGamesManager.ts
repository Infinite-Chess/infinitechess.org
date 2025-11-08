
// src/server/database/playerGamesManager.ts

/**
 * This script handles queries to the player_games table. 
 */

import jsutil from '../../shared/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import db from './database.js';
import { allPlayerGamesColumns } from './databaseTables.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types
import type { Player } from '../../shared/chess/util/typeutil.js';


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a player_games record. This is all allowed columns of a (user_id, game_id). */
interface PlayerGamesRecord {
	user_id?: number;
	game_id?: number;
	player_number?: Player;
	score?: number | null;
	clock_at_end_millis?: number | null;
	elo_at_game?: number | null;
	elo_change_from_game?: number | null;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason: string };


// Methods --------------------------------------------------------------------------------------------

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
		logEventsAndPrint(`When getting player_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allPlayerGamesColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM player_games WHERE user_id = ? AND game_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get<PlayerGamesRecord>(query, [user_id, game_id]);

		// If no row is found, return undefined
		if (!row) {
			logEventsAndPrint(`No matches found in player_games table for user_id = ${user_id} and game_id = ${game_id}.`, 'errLog.txt');
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEventsAndPrint(`Error executing query when gettings player game of user_id ${user_id} and game_id = ${game_id}: ${message}. The query: "${query}"`, 'errLog.txt');
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
		SELECT *
		FROM player_games
		WHERE game_id = ?
		ORDER BY player_number ASC -- Optional: order for consistency
	`;

	try {
		const entries = db.all(query, [game_id]) as PlayerGamesRecord[];
		return entries;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error getting all player_games entries for game "${game_id}": ${message}`, 'errLog.txt');
		return []; // Return an empty array on error
	}
}

/**
 * Gets player_games entries for all opponenents of a specific user for a list of specific games
 * @param user_id - The user_id of the player
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['user_id', 'player_number'])
 * @returns - an array of PlayerGamesRecord information about the members in a game who are not equal to user_id
 */
function getOpponentsOfUserFromGames(user_id: number, game_id_list: number[], columns: string[]): PlayerGamesRecord[] {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When getting player_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}
	if (!columns.every(column => typeof column === 'string' && allPlayerGamesColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}

	// Construct SQL query
	const placeholders = game_id_list.map(() => '?').join(', ');
	const query = `
		SELECT ${columns.join(', ')}
		FROM player_games
		WHERE user_id != ?
			AND game_id IN (${placeholders})
	`;

	try {
		// Execute the query and fetch result
		const rows = db.all<PlayerGamesRecord>(query, [user_id, ...game_id_list]);

		// If no rows found, return undefined
		if (!rows || rows.length === 0) {
			logEventsAndPrint(`No matches found in player_games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}.`, 'errLog.txt');
			return [];
		}

		// Return the fetched rows (single object)
		return rows;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error getting all player_games entries for game_id_list "${jsutil.ensureJSONString(game_id_list)}": ${message}`, 'errLog.txt');
		return [];
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
		logEventsAndPrint(`Invalid or empty columns and values provided for user ID "${user_id}" and game ID "${game_id}" when updating player_games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt'); // Detailed logging for debugging
		return { success: false, reason: 'Invalid arguments.' }; // Generic error message
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allPlayerGamesColumns.includes(column)) {
			logEventsAndPrint(`Invalid column "${column}" provided for user ID "${user_id}" and game ID "${game_id}" when updating player_games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt'); // Detailed logging for debugging
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
			logEventsAndPrint(`No changes made when updating player_games table columns ${JSON.stringify(columnsAndValues)} for game in player_games table with user ID "${user_id}" and game ID "${game_id}"! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt');
			return { success: false, reason: 'No changes made.' }; // Generic error message
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEventsAndPrint(`Error updating player_games table columns ${JSON.stringify(columnsAndValues)} for user ID "${user_id}" and game ID "${game_id}": ${message}! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt');
		// Return an error message
		return { success: false, reason: 'Database error.' }; // Generic error message
	}
}

/**
 * Retrieves the most recent N rated entries for a user on a specific leaderboard, returning only the specified columns from player_games.
 * Aborted games (where score is null) are skipped.
 * @param user_id - The ID of the user
 * @param leaderboard_id - The ID of the leaderboard to filter rated games
 * @param limit - Maximum number of recent games to fetch
 * @param columns - Array of column names from player_games to return (e.g., ['game_id', 'score']).
 * @returns Array of objects containing only the requested columns.
 */
function getRecentNRatedGamesForUser(user_id: number, leaderboard_id: number, limit: number, columns: string[]): PlayerGamesRecord[] {
	// Validate columns argument
	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When fetching recent games, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}
	if (!columns.every(col => typeof col === 'string' && allPlayerGamesColumns.includes(col))) {
		logEventsAndPrint(`Invalid columns requested from player_games table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return [];
	}

	// Dynamically build SELECT clause from requested columns
	const selectClause = columns.map(col => `pg.${col}`).join(', ');

	// Only include rated, non-aborted games on the specified leaderboard, sorted by game date
	const query = `
		SELECT ${selectClause}
		FROM player_games pg
		JOIN games g ON g.game_id = pg.game_id
		WHERE pg.user_id = ?
		  AND g.rated = 1
		  AND g.leaderboard_id = ?
		  AND pg.score IS NOT NULL
		ORDER BY g.date DESC
		LIMIT ?
	`;

	try {
		// Bind parameters: user, leaderboard, and limit
		return db.all(query, [user_id, leaderboard_id, limit]) as PlayerGamesRecord[];
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error fetching recent rated games for user ${user_id} on leaderboard ${leaderboard_id}: ${message}`, 'errLog.txt');
		return [];
	}
}


// Exports --------------------------------------------------------------------------------------------


export {
	getPlayerGamesData,
	getPlayersInGame,
	getOpponentsOfUserFromGames,
	// Commented out to emphasize this should not ever have to be used:
	// updatePlayerGamesColumns,
	getRecentNRatedGamesForUser,
};	
