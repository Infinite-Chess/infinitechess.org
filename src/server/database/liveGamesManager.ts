// src/server/database/liveGamesManager.ts

/**
 * This script manages the live_games table, which persists active game state
 * across server restarts. One row per active game.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the column reference.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete live_games record. */
export interface LiveGamesRecord extends LiveGameData {
	game_id: number;
}

/** Live game data columns, excluding the primary key. */
export interface LiveGameData {
	time_created: number;
	/**
	 * Preset variant code, or null for a custom-position
	 * game (its start position is in `position`).
	 */
	variant: string | null;
	/** A custom game's start position; null for preset games (complementary to `variant`). */
	position: string | null;
	clock: string;
	/** 0 = casual, 1 = rated */
	rated: 0 | 1;
	/** 0 = public, 1 = private */
	private: 0 | 1;
	moves: string;
	color_ticking: number | null;
	clock_snapshot_time: number | null;
	draw_offer_state: number | null;
	/** 0 = false, 1 = true */
	validate_moves: 0 | 1;
	/** Epoch ms the both-disconnected timer concludes the game. NULL unless both players are disconnected. */
	both_disconnected_end_time: number | null;
	/** Slide Limit modifier: max squares a sliding piece may travel. Null if the modifier is inactive. */
	mod_slide_limit: number | null;
}

// Methods ---------------------------------------------------------------------

/**
 * Inserts a new live game row into the database.
 * @param record - The complete live_games record to insert.
 * @throws If a database error occurs.
 */
function insert(record: LiveGamesRecord): void {
	const query = `
			INSERT INTO live_games (
				game_id, time_created, variant, position, clock, rated, private,
				moves, color_ticking, clock_snapshot_time,
				draw_offer_state, validate_moves, both_disconnected_end_time, mod_slide_limit
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;
	db.call(
		() =>
			db.run(query, [
				record.game_id, record.time_created, record.variant, record.position,
				record.clock, record.rated, record.private, record.moves, record.color_ticking,
				record.clock_snapshot_time, record.draw_offer_state, record.validate_moves,
				record.both_disconnected_end_time, record.mod_slide_limit,
			]), // prettier-ignore
		`Error inserting live game ${record.game_id}`,
	);
}

/**
 * Updates specific columns of a live game.
 * @param game_id - The game to update.
 * @param updates - An object containing only the columns to update and their new values.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function update(game_id: number, updates: Partial<LiveGameData>): void {
	db.call(() => {
		db.runRowUpdate({
			tableName: 'live_games',
			updates,
			errorContext: `updating live game ${game_id}`,
			whereClause: 'game_id = ?',
			whereValues: [game_id],
		});
	}, `Error updating live game ${game_id}`);
}

/**
 * Deletes a live game row and its live participant rows.
 * @param game_id - The game to delete.
 * @throws If a database error occurs.
 */
function remove(game_id: number): void {
	db.call(
		() => db.run('DELETE FROM live_games WHERE game_id = ?', [game_id]),
		`Error deleting live game ${game_id}`,
	);
}

/**
 * Retrieves all live game rows. Used on server startup to restore games.
 * @returns An array of all live_games records.
 * @throws If a database error occurs.
 */
function getAll(): LiveGamesRecord[] {
	return db.call(
		() => db.all<LiveGamesRecord>('SELECT * FROM live_games'),
		'Error retrieving all live games',
	);
}

// Exports ---------------------------------------------------------------------

export default { insert, update, remove, getAll };
