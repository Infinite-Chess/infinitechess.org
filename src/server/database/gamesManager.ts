// src/server/database/gamesManager.ts

/**
 * This script handles queries to the games table.
 */

import jsutil from '../../shared/util/jsutil.js';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import { allGamesColumns, game_id_upper_cap } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete games record. */
export interface GamesRecord {
	game_id: number;
	date: string;
	base_time_seconds: number | null;
	increment_seconds: number | null;
	variant: string;
	/** 0 => false  1 => true */
	rated: 0 | 1;
	leaderboard_id: number | null;
	/** 0 => false  1 => true */
	private: 0 | 1;
	result: string;
	termination: string;
	move_count: number;
	time_duration_millis: number | null;
	icn: string;
}

type GamesColumn = keyof GamesRecord;

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
		throw error; // Rethrow
	}
}

/**
 * Fetches specified columns of a single game from the games table based on game_id
 * @param game_id - The game_id of the game
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns An object containing the requested columns, or undefined if no match is found.
 * A miss is an expected outcome (e.g. games aborted before any moves are not stored).
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function getGameData<K extends GamesColumn>(
	game_id: number,
	columns: K[],
): Pick<GamesRecord, K> | undefined {
	try {
		// Validate the arguments...

		if (!Array.isArray(columns))
			throw new Error(
				`When getting game data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			);
		if (
			!columns.every(
				(column) => typeof column === 'string' && allGamesColumns.includes(column),
			)
		)
			throw new Error(
				`Invalid columns requested from games table: ${jsutil.ensureJSONString(columns)}`,
			);

		// Arguments are valid, move onto the SQL query construction
		const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id = ?`;

		// Execute the query and fetch result.
		return db.get<Pick<GamesRecord, K>>(query, [game_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error when getting game data of game_id ${game_id}: ${message}`,
			'errLog.txt',
		);
		throw error;
	}
}

/**
 * Fetches specified columns of multiple games from the games table based on list of game_ids.
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns An array of objects with the requested columns.
 * @throws If invalid arguments are provided, if no matches are found, or if a database error occurs.
 */
function getMultipleGameData<K extends GamesColumn>(
	game_id_list: number[],
	columns: K[],
): Pick<GamesRecord, K>[] {
	try {
		// Validate the arguments...

		if (!Array.isArray(columns))
			throw new Error(
				`When getting game data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			);
		if (
			!columns.every(
				(column) => typeof column === 'string' && allGamesColumns.includes(column),
			)
		)
			throw new Error(
				`Invalid columns requested from games table: ${jsutil.ensureJSONString(columns)}`,
			);

		// Arguments are valid, move onto constructing the SQL query...
		const placeholders = game_id_list.map(() => '?').join(', ');
		const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id IN (${placeholders})`;

		// Execute the query and fetch result
		const rows = db.all<Pick<GamesRecord, K>>(query, game_id_list);

		// Every requested game_id should exist
		if (rows.length < game_id_list.length)
			throw new Error(
				`At least one missing game in games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}.`,
			);

		// Return the fetched rows
		return rows;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error when getting game data of game_ids ${jsutil.ensureJSONString(game_id_list)}: ${message}`,
			'errLog.txt',
		);
		throw error;
	}
}

// Exports --------------------------------------------------------------------------------------------

export { genUniqueGameID, getGameData, getMultipleGameData };
