// src/server/database/gamesManager.ts

/**
 * This script handles queries to the games table.
 */

import uuid from '../../shared/util/uuid.js';
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
	/**
	 * Preset variant code, or null for a
	 * custom-position game (position lives in the ICN).
	 */
	variant: string | null;
	/** 0 => false  1 => true */
	rated: 0 | 1;
	leaderboard_id: number | null;
	/** 0 => false  1 => true */
	private: 0 | 1;
	result: string;
	termination: string;
	move_count: number;
	time_duration_millis: number | null;
	/**
	 * Contains the moves list and clock timestamps,
	 * and if the variant is null (custom), the position as well.
	 */
	icn: string;
}

type GamesColumn = keyof GamesRecord;

// Methods --------------------------------------------------------------------------------------------

/**
 * Decodes a base62 game-id string (as it appears in `/game/:id`) into its numeric id.
 * @returns The numeric id, or `undefined` if the string is malformed, out of range, or
 * non-canonical (e.g. leading zeros) — ensuring each game has exactly one valid URL.
 */
export function decodeGameId(idStr: string): number | undefined {
	let decoded: number;
	try {
		decoded = uuid.base62ToBase10(idStr);
	} catch {
		return undefined; // Invalid base62 characters
	}
	if (decoded >= game_id_upper_cap) return undefined; // Out of range
	// Prevents '000f6Ke' from being treated as game id 'f6Ke'
	if (uuid.base10ToBase62(decoded) !== idStr) return undefined; // Non-canonical encoding
	return decoded;
}

/**
 * Generates a game_id **UNIQUE** to all other game ids in the games table.
 * @returns - A unique game_id.
 * @throws If a database error occurs.
 */
export function genUniqueGameID(): number {
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
 * @throws If a database error occurs.
 */
export function isGameIdTaken(game_id: number): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM games WHERE game_id = ?) AS found';
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [game_id]),
		`Error checking if game_id "${game_id}" is taken`,
	);
	return Boolean(row?.found);
}

/**
 * Fetches specified columns of a single game from the games table based on game_id
 * @param game_id - The game_id of the game
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns An object containing the requested columns, or undefined if no match is found.
 * A miss is an expected outcome (e.g. games aborted before any moves are not stored).
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function getGameData<K extends GamesColumn>(
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
 * Updates specific columns of a logged game. Used when a cheat report overturns an
 * already-logged game's conclusion (see gamelogger.updateOverturnedGame).
 * @param game_id - The game to update.
 * @param updates - Only the columns to change and their new values. `game_id` is not updatable.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function updateGame(game_id: number, updates: Partial<GamesRecord>): void {
	dbCall(() => {
		const entries = Object.entries(updates);
		if (entries.length === 0)
			throw new Error(
				`Empty updates provided when updating game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`,
			);
		if (!entries.every(([col]) => col !== 'game_id' && allGamesColumns.includes(col)))
			throw new Error(
				`Invalid columns provided when updating game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`,
			);

		const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
		const values = entries.map(([, val]) => val);
		db.run(`UPDATE games SET ${setClauses} WHERE game_id = ?`, [...values, game_id]);
	}, `Error updating game ${game_id}`);
}

/**
 * Deletes a game row (cascades to player_games). Used when a cheat report overturns a
 * game down to zero moves — which is never stored, so the whole record is removed.
 * @param game_id - The game to delete.
 * @throws If a database error occurs.
 */
export function deleteGame(game_id: number): void {
	dbCall(
		() => db.run('DELETE FROM games WHERE game_id = ?', [game_id]),
		`Error deleting game ${game_id}`,
	);
}

/**
 * Fetches specified columns of multiple games from the games table based on list of game_ids.
 * @param game_id_list - A list of game_ids
 * @param columns - The columns to retrieve (e.g., ['game_id', 'date', 'rated']).
 * @returns An array of objects with the requested columns.
 * @throws If invalid arguments are provided, if no matches are found, or if a database error occurs.
 */
export function getMultipleGameData<K extends GamesColumn>(
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
