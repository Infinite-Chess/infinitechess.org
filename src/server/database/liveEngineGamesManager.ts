// src/server/database/liveEngineGamesManager.ts

/**
 * This script manages the live_engine_games table, which persists per-engine
 * state for active games across server restarts. One row per engine per game.
 * Engines omit disconnect state, as they never disconnect.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the column reference.
 */

import db from './database.js';

// Types --------------------------------------------------------------------------------------

/** Per-engine live game data columns, excluding the composite key fields. */
interface LiveEngineGameData {
	time_remaining_ms: number | null;
	engine: string;
	engine_version: string;
	strength_level: number;
}

/** Structure of a complete live_engine_games record. */
export interface LiveEngineGamesRecord extends LiveEngineGameData {
	game_id: number;
	player_number: number;
}

// Methods ------------------------------------------------------------------------------------

/**
 * Inserts a new live engine game row into the database.
 * @param record - The complete live_engine_games record to insert.
 * @throws If a database error occurs.
 */
function insert(record: LiveEngineGamesRecord): void {
	const query = `
		INSERT INTO live_engine_games (
			game_id, player_number, time_remaining_ms,
			engine, engine_version, strength_level
		) VALUES (?, ?, ?, ?, ?, ?)
	`;
	db.call(
		() =>
			db.run(query, [
				record.game_id,
				record.player_number,
				record.time_remaining_ms,
				record.engine,
				record.engine_version,
				record.strength_level,
			]),
		`Error inserting live engine participant for game ${record.game_id}`,
	);
}

/**
 * Updates specific columns of an engine's live game record.
 * @param game_id - The game ID.
 * @param player_number - The player number to update.
 * @param updates - An object containing only the columns to update and their new values.
 * @throws If a database error occurs.
 */
function update(
	game_id: number,
	player_number: number,
	updates: Partial<LiveEngineGameData>,
): void {
	db.call(() => {
		db.runRowUpdate({
			tableName: 'live_engine_games',
			updates,
			errorContext: `updating live engine participant for game ${game_id}`,
			whereClause: 'game_id = ? AND player_number = ?',
			whereValues: [game_id, player_number],
		});
	}, `Error updating live engine participant for game ${game_id}`);
}

/** Retrieves every live engine participant for startup restoration. */
function getAll(): LiveEngineGamesRecord[] {
	return db.call(
		() => db.all<LiveEngineGamesRecord>('SELECT * FROM live_engine_games'),
		'Error retrieving live engine participants',
	);
}

// Exports ------------------------------------------------------------------------------------

export default { insert, update, getAll };
