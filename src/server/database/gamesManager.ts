/**
 * This script handles queries to the games table. 
 */

import jsutil from '../../client/scripts/esm/util/jsutil.js';
// @ts-ignore
import { logEvents } from '../middleware/logEvents.js'; // Adjust path if needed
// @ts-ignore
import db from './database.js';
// @ts-ignore
import { allGamesColumns, game_id_upper_cap } from './databaseTables.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a games record. This is all allowed columns of a game_id. */
interface GamesRecord {
    game_id?: number;
    date?: string;
    players?: string;
    elo?: string;
    rating_diff?: string;
    time_control?: string;
    variant?: string;
    rated?: number;
    private?: number;
    result?: string;
    termination?: string;
    movecount?: number;
    icn?: string;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason?: string };


// Methods --------------------------------------------------------------------------------------------

/**
 * Adds an entry to the games table
 * @param [options] - Parameters for all the entries of the game
 * @returns A result object indicating success or failure.
 */
function addGameToGamesTable(
	options: {
        date: string,
        players: string,
        elo: string | null,
        rating_diff: string | null,
        time_control: string,
        variant: string,
        rated: number,
        private: number,
        result: string,
        termination: string,
        movecount: number,
        icn: string
    }): ModifyQueryResult {

	// Generate a unique game ID
	const game_id = genUniqueGameID();

	const query = `
	INSERT INTO games (
		game_id,
        date,
        players,
        elo,
        rating_diff,
        time_control,
        variant,
        rated,
        private,
        result,
        termination,
        movecount,
        icn
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;

	try {
		// Execute the query with the provided values
		const result = db.run(query, 
            [
                game_id,
                options.date,
                options.players,
                options.elo,
                options.rating_diff,
                options.time_control,
                options.variant,
                options.rated,
                options.private,
                options.result,
                options.termination,
                options.movecount,
                options.icn
            ]
		);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error adding game to games table "${game_id}": ${message}`, 'errLog.txt', { print: true });

		// Return an error message
		// Check for specific constraint errors if possible (e.g., FOREIGN KEY failure)
		let reason = 'Failed to add game to games table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = 'Game ID already exists in the games table.';
			}
		}
		return { success: false, reason };
	}
}

/**
 * Generates a **UNIQUE** game_id by testing if it's taken already.
 * @returns - A unique game_id.
 */
function genUniqueGameID(): number {
	let id: number;
	do {
		id = generateRandomGameId();
	} while (isGameIdTaken(id));
	return id;
}

/**
 * Generates a random game_id. DOES NOT test if it's taken already.
 * @returns - A random game_id.
 */
function generateRandomGameId(): number {
	// Generate a random number between 0 and game_id_upper_cap
	return Math.floor(Math.random() * game_id_upper_cap);
}

/**
 * Checks if a given game_id exists in the games table.
 * @param game_id - The game_id to check.
 * @returns - Returns true if the game_id exists, false otherwise.
 */
function isGameIdTaken(game_id: number): boolean {
	try {
		const query = 'SELECT 1 FROM games WHERE game_id = ?';

		// Execute query to check if the game_id exists in the games table
		const row = db.get(query, [game_id]); // { '1': 1 }

		// If a row is found, the game_id exists
		return row !== undefined;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error if the query fails
		logEvents(`Error checking if game_id "${game_id}" is taken: ${message}`, 'errLog.txt', { print: true });
		return false; // Return false if an error occurs
	}
}

/**
 * Fetches specified columns of a single game from the games table based on game_id
 * @param game_id - The game_id of the game
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'players']).
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function getGameData(game_id: number, columns: string[]): GamesRecord | undefined {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEvents(`When getting game data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allGamesColumns.includes(column))) {
		logEvents(`Invalid columns requested from games table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt', { print: true });
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get(query, [game_id]) as GamesRecord | undefined;

		// If no row is found, return undefined
		if (!row) {
			logEvents(`No matches found in games table for game_id = ${game_id}.`, 'errLog.txt', { print: true });
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEvents(`Error executing query when getting game data of game_id ${game_id}: ${message}. The query: "${query}"`, 'errLog.txt', { print: true });
		return undefined;
	}
}

/**
 * Updates multiple column values in the games table for a given game.
 * 
 * GOOD TO HAVE. BUT SHOULD NEVER BE USED EXCEPT FOR EXTREME CIRCUMSTANCES.
 * All added games should have correct values from the start.
 * @param game_id - The game ID of the games.
 * @param columnsAndValues - An object containing column-value pairs to update.
 * @returns - A result object indicating success or failure.
 */
// eslint-disable-next-line no-unused-vars
function updateGameColumns(game_id: number, columnsAndValues: GamesRecord): ModifyQueryResult {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		logEvents(`Invalid or empty columns and values provided for game ID "${game_id}" when updating games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
		return { success: false, reason: 'Invalid arguments.' }; // Generic error message
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allGamesColumns.includes(column)) {
			logEvents(`Invalid column "${column}" provided for game ID "${game_id}" when updating games columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
			return { success: false, reason: 'Invalid column.' }; // Generic error message
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the game_id as the last parameter for the WHERE clause
	values.push(game_id);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE games SET ${setStatements} WHERE game_id = ?`;

	try {
		// Execute the update query
		const result = db.run(updateQuery, values);

		// Check if the update was successful
		if (result.changes > 0) return { success: true, result };
		else {
			logEvents(`No changes made when updating games table columns ${JSON.stringify(columnsAndValues)} for game in games table with id "${game_id}"! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
			return { success: false, reason: 'No changes made.' }; // Generic error message
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error updating games table columns ${JSON.stringify(columnsAndValues)} for game ID "${game_id}": ${message}! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
		// Return an error message
		return { success: false, reason: `Database error.` }; // Generic error message
	}
}

/**
 * Deletes a game from the games table.
 * 
 * Maybe useful to have? SHOULD NEVER BE USED THOUGH EXCEPT FOR EXTREME CIRCUMSTANCES.
 * NOT EVEN WHEN A USER DELETES THEIR ACCOUNT. Games are public information.
 * If a game is deleted, but a user isn't, then their game history will point to a game that doesn't exist.
 * @param game_id - The ID of the game to delete.
 * @returns - A result object indicating success or failure.
 */
// eslint-disable-next-line no-unused-vars
function deleteGame(game_id: number): ModifyQueryResult {
	// SQL query to delete a game by its game_id
	const query = 'DELETE FROM games WHERE game_id = ?';

	try {
		// Execute the delete query
		const result = db.run(query, [game_id]); // { changes: 1 }

		// Check if any rows were deleted
		if (result.changes === 0) {
			logEvents(`Cannot delete game of ID "${game_id}", it was not found.`, 'errLog.txt', { print: true }); // Detailed logging for debugging
			return { success: false, reason: 'Game not found.' }; // Generic error message
		}

		return { success: true, result }; // Deletion made successfully

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEvents(`Error deleting game with ID "${game_id}": ${message}`, 'errLog.txt', { print: true }); // Detailed logging for debugging
		// Return an error message
		return { success: false, reason: 'Database error.' }; // Generic error message
	}
}


// Exports --------------------------------------------------------------------------------------------


export {
	addGameToGamesTable,
	getGameData,
	// Commented out to emphasize they should not ever have to be used.
	// updateGameColumns,
	// deleteGame
};	
