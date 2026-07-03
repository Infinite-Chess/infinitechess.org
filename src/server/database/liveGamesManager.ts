// src/server/database/liveGamesManager.ts

/**
 * This script manages the live_games table, which persists active game state
 * across server restarts. One row per active game.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allLiveGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

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
	conclusion_condition: string | null;
	conclusion_victor: number | null;
	time_ended: number | null;
	/** Epoch ms deadline to permanently log (lock in) a concluded game. NULL while ongoing. */
	log_time: number | null;
	/** 0 = false, 1 = true */
	validate_moves: 0 | 1;
	/** Epoch ms the both-disconnected timer concludes the game. NULL unless both players are disconnected. */
	both_disconnected_end_time: number | null;
}

// Methods --------------------------------------------------------------------------------------------

/**
 * Inserts a new live game row into the database.
 * @param record - The complete live_games record to insert.
 * @throws If a database error occurs.
 */
export function insertLiveGame(record: LiveGamesRecord): void {
	const query = `
			INSERT INTO live_games (
				game_id, time_created, variant, position, clock, rated, private,
				moves, color_ticking, clock_snapshot_time,
				draw_offer_state,
				conclusion_condition, conclusion_victor, time_ended,
				log_time, validate_moves, both_disconnected_end_time
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;
	dbCall(
		() =>
			db.run(query, [
				record.game_id,
				record.time_created,
				record.variant,
				record.position,
				record.clock,
				record.rated,
				record.private,
				record.moves,
				record.color_ticking,
				record.clock_snapshot_time,
				record.draw_offer_state,
				record.conclusion_condition,
				record.conclusion_victor,
				record.time_ended,
				record.log_time,
				record.validate_moves,
				record.both_disconnected_end_time,
			]),
		`Error inserting live game ${record.game_id}`,
	);
}

/**
 * Updates specific columns of a live game.
 * @param game_id - The game to update.
 * @param updates - An object containing only the columns to update and their new values.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function updateLiveGame(game_id: number, updates: Partial<LiveGameData>): void {
	dbCall(() => {
		// Validate the input structure...
		if (typeof updates !== 'object' || updates === null || Object.keys(updates).length === 0)
			throw new Error(
				`Invalid or empty updates provided when updating live game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`,
			);
		const entries = Object.entries(updates);
		if (!entries.every(([col]) => allLiveGamesColumns.includes(col)))
			throw new Error(
				`Invalid columns provided when updating live game ${game_id}! Received: ${jsutil.ensureJSONString(updates)}`,
			);

		// Move on to the SQL query
		const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
		const values = entries.map(([, val]) => val);
		const query = `UPDATE live_games SET ${setClauses} WHERE game_id = ?`;
		db.run(query, [...values, game_id]);
	}, `Error updating live game ${game_id}`);
}

/**
 * Deletes a live game row (cascades to live_player_games).
 * @param game_id - The game to delete.
 * @throws If a database error occurs.
 */
export function deleteLiveGame(game_id: number): void {
	dbCall(
		() => db.run('DELETE FROM live_games WHERE game_id = ?', [game_id]),
		`Error deleting live game ${game_id}`,
	);
}

/**
 * Retrieves all live game rows. Used on server startup to restore games.
 * @returns An array of all live_games records.
 * @throws If a database error occurs.
 */
export function getAllLiveGames(): LiveGamesRecord[] {
	return dbCall(
		() => db.all<LiveGamesRecord>('SELECT * FROM live_games'),
		'Error retrieving all live games',
	);
}
