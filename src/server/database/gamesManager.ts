// src/server/database/gamesManager.ts

/**
 * This script handles queries to the games table.
 */

import jsutil from '../../shared/util/jsutil.js';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import { allGamesColumns, game_id_upper_cap } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a games record. This is all allowed columns of a game_id. */
export interface GamesRecord {
	game_id?: number;
	date?: string;
	base_time_seconds?: number | null;
	increment_seconds?: number | null;
	variant?: string;
	/** 0 => false  1 => true */
	rated?: 0 | 1;
	leaderboard_id?: number | null;
	/** 0 => false  1 => true */
	private?: 0 | 1;
	result?: string;
	termination?: string;
	move_count?: number;
	time_duration_millis?: number | null;
	icn?: string;
}

// Methods --------------------------------------------------------------------------------------------

/**
 * Generates a game_id **UNIQUE** to all other game ids in the games table.
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
		const row = db.get<{ '1': number }>(query, [game_id]);

		// If a row is found, the game_id exists
		return row !== undefined;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error if the query fails
		logEventsAndPrint(
			`Error checking if game_id "${game_id}" is taken: ${message}`,
			'errLog.txt',
		);
		return false; // Return false if an error occurs
	}
}

/**
 * Fetches specified columns of a single game from the games table based on game_id
 * @param game_id - The game_id of the game
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function getGameData(game_id: number, columns: string[]): GamesRecord | undefined {
	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(
			`When getting game data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return undefined;
	}
	if (
		!columns.every((column) => typeof column === 'string' && allGamesColumns.includes(column))
	) {
		logEventsAndPrint(
			`Invalid columns requested from games table: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get<GamesRecord>(query, [game_id]);

		// If no row is found, return undefined
		if (!row) {
			logEventsAndPrint(
				`No matches found in games table for game_id = ${game_id}.`,
				'errLog.txt',
			);
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEventsAndPrint(
			`Error executing query when getting game data of game_id ${game_id}: ${message}. The query: "${query}"`,
			'errLog.txt',
		);
		return undefined;
	}
}

/**
 * Fetches specified columns of multiple games from the games table based on list of game_ids
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns - An array of GamesRecord objects, or undefined if no matches found.
 */
function getMultipleGameData(game_id_list: number[], columns: string[]): GamesRecord[] | undefined {
	// Guard clauses... Validating the arguments...#

	if (!Array.isArray(columns)) {
		logEventsAndPrint(
			`When getting game data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return undefined;
	}
	if (
		!columns.every((column) => typeof column === 'string' && allGamesColumns.includes(column))
	) {
		logEventsAndPrint(
			`Invalid columns requested from games table: ${jsutil.ensureJSONString(columns)}`,
			'errLog.txt',
		);
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const placeholders = game_id_list.map(() => '?').join(', ');
	const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id IN (${placeholders})`;

	try {
		// Execute the query and fetch result
		const rows = db.all<GamesRecord>(query, game_id_list);

		// If no rows found, return undefined
		if (!rows || rows.length === 0) {
			logEventsAndPrint(
				`No matches found in games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}.`,
				'errLog.txt',
			);
			return undefined;
		}

		// Return the fetched rows (single object)
		return rows;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEventsAndPrint(
			`Error executing query for game_ids ${jsutil.ensureJSONString(game_id_list)}: ${message}. Query: "${query}"`,
			'errLog.txt',
		);
		return undefined;
	}
}

// Exports --------------------------------------------------------------------------------------------

export {
	genUniqueGameID,
	getGameData,
	getMultipleGameData,
	// Commented out to emphasize they should not ever have to be used.
	// updateGameColumns,
	// deleteGame
};
