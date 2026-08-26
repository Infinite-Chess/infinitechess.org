// src/server/database/engineGamesManager.ts

/**
 * Manages permanent engine participants. One row mirrors one player_games participant.
 */

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete engine_games record. */
interface EngineGamesRecord {
	game_id: number;
	player_number: number;
	score: number | null;
	engine: string;
	engine_version: string;
	strength_level: number;
}

type EngineGamesColumn = keyof EngineGamesRecord;

// Methods ---------------------------------------------------------------------

/**
 * Inserts one engine participant row for a game.
 *
 * Intentionally skips `dbCall`. gamelogger is its only caller, and it already logs the failure
 * and rolls back the surrounding transaction — wrapping this would log the same error twice.
 * @throws If a database error occurs.
 */
function insert(record: EngineGamesRecord): void {
	const query = `
		INSERT INTO engine_games (
			game_id, player_number, score,
			engine, engine_version, strength_level
		) VALUES (?, ?, ?, ?, ?, ?)
	`;
	db.run(query, [
		record.game_id, record.player_number, record.score,
		record.engine, record.engine_version, record.strength_level,
	]); // prettier-ignore
}

/**
 * Fetches the requested columns of every engine_games row for a single game.
 * @returns One row per engine participant, ordered by player_number.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
function getOfGame<K extends EngineGamesColumn>(
	game_id: number,
	columns: K[],
): Pick<EngineGamesRecord, K>[] {
	return db.call(() => {
		db.assertColumnsValid(columns, 'engine_games');

		return db.all<Pick<EngineGamesRecord, K>>(
			`SELECT ${columns.join(', ')} FROM engine_games WHERE game_id = ? ORDER BY player_number`,
			[game_id],
		);
	}, `Error getting engine participants for game ${game_id}`);
}

// Exports ---------------------------------------------------------------------

export default { insert, getOfGame };
