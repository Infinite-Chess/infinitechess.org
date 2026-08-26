// src/server/database/gamesManager.ts

/**
 * This script handles queries to the games table.
 */

import uuid from '../../shared/util/uuid.js';
import jsonutil from '../../shared/util/jsonutil.js';

import db from './database.js';

// Constants -------------------------------------------------------------------

/**
 * 62**4: Limit of unique game ids with 4-digit base-62 game ids! EXCLUSIVE.
 * Matches `memberManager`'s user-id cap, but nothing depends on the two being equal.
 */
const GAME_ID_UPPER_CAP: number = 14_776_336;

// Types -----------------------------------------------------------------------

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
	/** Slide Limit modifier: max squares a sliding piece may travel. Null if the modifier is inactive. */
	mod_slide_limit: number | null;
}

type GamesColumn = keyof GamesRecord;

// Methods ---------------------------------------------------------------------

/**
 * Decodes a base62 game-id string (as it appears in `/game/:id`) into its numeric id.
 * @returns The numeric id, or `undefined` if the string is malformed, out of range, or
 * non-canonical (e.g. leading zeros) — ensuring each game has exactly one valid URL.
 */
function decodeID(idStr: string): number | undefined {
	let decoded: number;
	try {
		decoded = uuid.base62ToBase10(idStr);
	} catch {
		return undefined; // Invalid base62 characters
	}
	if (decoded >= GAME_ID_UPPER_CAP) return undefined; // Out of range
	// Prevents '000f6Ke' from being treated as game id 'f6Ke'
	if (uuid.base10ToBase62(decoded) !== idStr) return undefined; // Non-canonical encoding
	return decoded;
}

/**
 * Generates a game_id unique to all other game ids in the games table.
 * @returns - A unique game_id.
 * @throws If a database error occurs.
 */
function genUniqueID(): number {
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
	// Generate a random number between 0 and GAME_ID_UPPER_CAP
	return Math.floor(Math.random() * GAME_ID_UPPER_CAP);
}

/**
 * Checks if a given game_id exists in the games table.
 * @param game_id - The game_id to check.
 * @returns - Returns true if the game_id exists, false otherwise.
 * @throws If a database error occurs.
 */
function isGameIdTaken(game_id: number): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM games WHERE game_id = ?) AS found';
	const row = db.call(
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
function getData<K extends GamesColumn>(
	game_id: number,
	columns: K[],
): Pick<GamesRecord, K> | undefined {
	return db.call(() => {
		db.assertColumnsValid(columns, 'games');

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
function getMultipleData<K extends GamesColumn>(
	game_id_list: number[],
	columns: K[],
): Pick<GamesRecord, K>[] {
	return db.call(
		() => {
			db.assertColumnsValid(columns, 'games');

			// Arguments are valid, move onto the SQL query
			const placeholders = game_id_list.map(() => '?').join(', ');
			const query = `SELECT ${columns.join(', ')} FROM games WHERE game_id IN (${placeholders})`;
			const rows = db.all<Pick<GamesRecord, K>>(query, game_id_list);
			if (rows.length < game_id_list.length)
				throw new Error(`At least one missing game in games table for game_ids: ${jsonutil.ensureJSONString(game_id_list)}.`); // prettier-ignore
			return rows;
		},
		`Error when getting game data of game_ids ${jsonutil.ensureJSONString(game_id_list)}`,
	);
}

// Writes ----------------------------------------------------------------------

// These intentionally skip `dbCall`. gamelogger is their only caller, and it already logs the
// failure and rolls back the surrounding transaction — wrapping them would log the same error twice.

/**
 * Inserts one game record.
 * @throws If a database error occurs.
 */
function insert(record: GamesRecord): void {
	const query = `
		INSERT INTO games (
			game_id, date, base_time_seconds, increment_seconds, variant, rated,
			leaderboard_id, private, result, termination, move_count,
			time_duration_millis, icn, mod_slide_limit
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	db.run(query, [
		record.game_id, record.date, record.base_time_seconds, record.increment_seconds,
		record.variant, record.rated, record.leaderboard_id, record.private, record.result,
		record.termination, record.move_count, record.time_duration_millis, record.icn,
		record.mod_slide_limit
	]); // prettier-ignore
}

/**
 * Updates specific columns of a logged game. Used when a
 * cheat report overturns an already-logged game's conclusion.
 * @param game_id - The game to update.
 * @param updates - Only the columns to change and their new values. `game_id` is not updatable.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function update(game_id: number, updates: Partial<GamesRecord>): void {
	db.runRowUpdate({
		tableName: 'games',
		excludedColumns: ['game_id'],
		updates,
		errorContext: `updating game ${game_id}`,
		whereClause: 'game_id = ?',
		whereValues: [game_id],
	});
}

/**
 * Deletes a game row (cascades to player_games). Used when a cheat report overturns a
 * game down to zero moves — which is never stored, so the whole record is removed.
 * @param game_id - The game to delete.
 * @throws If a database error occurs.
 */
function remove(game_id: number): void {
	db.run('DELETE FROM games WHERE game_id = ?', [game_id]);
}

// Exports ---------------------------------------------------------------------

export default {
	// Methods
	decodeID,
	genUniqueID,
	getData,
	getMultipleData,
	// Writes
	insert,
	update,
	remove,
};
