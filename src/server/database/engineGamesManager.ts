// src/server/database/engineGamesManager.ts

/**
 * This script manages the engine_games table: one row per game against an engine,
 * created at game start. The engine plays locally in the owner's browser; the server
 * only records state (for mid-game resume) and, on conclusion, the row is kept
 * (moves blanked) as the permanent record of the engine participant + settings.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allEngineGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete engine_games record. */
export interface EngineGamesRecord {
	game_id: number;
	time_created: number;
	/** The human owner's user id, if signed in. */
	user_id: number | null;
	/** The human owner's browser id. */
	browser_id: string;
	/** The human's color. 1 => White  2 => Black */
	player_color: number;
	engine: string;
	strength_level: number;
	/**
	 * Preset variant code, or null for a custom-position
	 * game (its start position is in `position`).
	 */
	variant: string | null;
	/** A custom game's start position; null for preset games (complementary to `variant`). */
	position: string | null;
	clock: string;
	/** Compact ICN moves with clock stamps. Blanked once the game is logged to the games table. */
	moves: string;
	/** Ms remaining snapshots; null for untimed games. */
	clock_white: number | null;
	clock_black: number | null;
	/** Epoch ms the ticking color's turn began; lets a mid-turn refresh deduct time elapsed while away. Null when no clock is ticking. */
	turn_start_time: number | null;
	/** Epoch ms of the last state sync; drives the stale-game purge. */
	last_updated: number;
}

type EngineGamesColumn = keyof EngineGamesRecord;

// Methods --------------------------------------------------------------------------------------------

/**
 * Checks if a given game_id exists in the engine_games table.
 * @throws If a database error occurs.
 */
export function isEngineGameIdTaken(game_id: number): boolean {
	const query = 'SELECT EXISTS(SELECT 1 FROM engine_games WHERE game_id = ?) AS found';
	const row = dbCall(
		() => db.get<{ found: 0 | 1 }>(query, [game_id]),
		`Error checking if engine game_id "${game_id}" is taken`,
	);
	return Boolean(row?.found);
}

/**
 * Inserts a new engine game row into the database.
 * @throws If a database error occurs.
 */
export function insertEngineGame(record: EngineGamesRecord): void {
	const query = `
		INSERT INTO engine_games (
			game_id, time_created, user_id, browser_id, player_color, engine,
			strength_level, variant, position, clock, moves, clock_white,
			clock_black, turn_start_time, last_updated
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	dbCall(
		() =>
			db.run(query, [
				record.game_id,
				record.time_created,
				record.user_id,
				record.browser_id,
				record.player_color,
				record.engine,
				record.strength_level,
				record.variant,
				record.position,
				record.clock,
				record.moves,
				record.clock_white,
				record.clock_black,
				record.turn_start_time,
				record.last_updated,
			]),
		`Error inserting engine game ${record.game_id}`,
	);
}

/**
 * Fetches specified columns of a single engine game.
 * @returns An object containing the requested columns, or undefined if no such row exists.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function getEngineGameData<K extends EngineGamesColumn>(
	game_id: number,
	columns: K[],
): Pick<EngineGamesRecord, K> | undefined {
	return dbCall(() => {
		if (!columns.every((column) => allEngineGamesColumns.includes(column)))
			throw new Error(
				`Invalid columns requested from engine_games table: ${jsutil.ensureJSONString(columns)}`,
			);
		const query = `SELECT ${columns.join(', ')} FROM engine_games WHERE game_id = ?`;
		return db.get<Pick<EngineGamesRecord, K>>(query, [game_id]);
	}, `Error when getting engine game data of game_id ${game_id}`);
}

/**
 * Updates specific columns of an engine game. `game_id` is not updatable.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function updateEngineGame(game_id: number, updates: Partial<EngineGamesRecord>): void {
	dbCall(() => {
		const entries = Object.entries(updates);
		if (entries.length === 0)
			throw new Error(`Empty updates provided when updating engine game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`); // prettier-ignore
		if (!entries.every(([col]) => col !== 'game_id' && allEngineGamesColumns.includes(col)))
			throw new Error(`Invalid columns provided when updating engine game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`); // prettier-ignore

		const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
		const values = entries.map(([, val]) => val);
		db.run(`UPDATE engine_games SET ${setClauses} WHERE game_id = ?`, [...values, game_id]);
	}, `Error updating engine game ${game_id}`);
}

/**
 * Deletes an engine game row. Used when a game is abandoned/aborted
 * with zero moves (never logged, so no record should remain).
 * @throws If a database error occurs.
 */
export function deleteEngineGame(game_id: number): void {
	dbCall(
		() => db.run('DELETE FROM engine_games WHERE game_id = ?', [game_id]),
		`Error deleting engine game ${game_id}`,
	);
}

/**
 * Returns how many engine games the given owner created since `sinceMillis`, plus the latest
 * such creation time — used to throttle (cooldown) and cap (daily) engine-game creation.
 * Signed-in owners match on `user_id`; guests on `browser_id`.
 * @throws If a database error occurs.
 */
export function getEngineGameCreationStats(
	owner: { user_id: number | null; browser_id: string },
	sinceMillis: number,
): { count: number; latest: number | null } {
	const identityClause = owner.user_id !== null ? 'user_id = ?' : 'user_id IS NULL AND browser_id = ?'; // prettier-ignore
	const identityValue = owner.user_id !== null ? owner.user_id : owner.browser_id;
	const query = `
		SELECT COUNT(*) AS count, MAX(time_created) AS latest
		FROM engine_games
		WHERE time_created >= ? AND ${identityClause}
	`;
	const row = dbCall(
		() => db.get<{ count: number; latest: number | null }>(query, [sinceMillis, identityValue]),
		'Error counting engine game creations',
	);
	return { count: row?.count ?? 0, latest: row?.latest ?? null };
}

/**
 * Deletes engine games that were never concluded (no games-table row) and haven't
 * been touched since the cutoff — abandoned mid-game and never resumed.
 * Concluded games' rows are kept forever (they name the engine participant).
 * @returns The number of rows deleted.
 * @throws If a database error occurs.
 */
export function deleteStaleUnconcludedEngineGames(cutoffEpochMillis: number): number {
	const query = `
		DELETE FROM engine_games
		WHERE last_updated < ?
		  AND game_id NOT IN (SELECT game_id FROM games)
	`;
	return dbCall(
		() => db.run(query, [cutoffEpochMillis]).changes,
		'Error deleting stale engine games',
	);
}
