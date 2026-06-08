// src/server/database/gamesManager.ts

/**
 * This script handles queries to the games table.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
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
	const query = 'SELECT 1 FROM games WHERE game_id = ?';
	const row = dbCall(
		() => db.get<{ '1': number }>(query, [game_id]),
		`Error checking if game_id "${game_id}" is taken`,
	);
	return row !== undefined;
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
	return dbCall(() => {
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

		// Arguments are valid, move onto the SQL query
		const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id = ?`;
		return db.get<Pick<GamesRecord, K>>(query, [game_id]);
	}, `Error when getting game data of game_id ${game_id}`);
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
	return dbCall(
		() => {
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

			// Arguments are valid, move onto the SQL query
			const placeholders = game_id_list.map(() => '?').join(', ');
			const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id IN (${placeholders})`;
			const rows = db.all<Pick<GamesRecord, K>>(query, game_id_list);
			if (rows.length < game_id_list.length)
				throw new Error(
					`At least one missing game in games table for game_ids: ${jsutil.ensureJSONString(game_id_list)}.`,
				);
			return rows;
		},
		`Error when getting game data of game_ids ${jsutil.ensureJSONString(game_id_list)}`,
	);
}

// Exports --------------------------------------------------------------------------------------------

export { genUniqueGameID, getGameData, getMultipleGameData };
