// src/server/database/engineGamesManager.ts

/**
 * Manages permanent engine participants. One row mirrors one player_games participant.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allEngineGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete engine_games record. */
export interface EngineGamesRecord {
	game_id: number;
	player_number: number;
	score: number | null;
	clock_at_end_millis: number | null;
	engine: string;
	engine_version: string;
	strength_level: number;
}

type EngineGamesColumn = keyof EngineGamesRecord;

// Methods --------------------------------------------------------------------------------------------

/**
 * Inserts one engine participant row for a game.
 *
 * Intentionally skips `dbCall`. gamelogger is its only caller, and it already logs the failure
 * and rolls back the surrounding transaction — wrapping this would log the same error twice.
 * @throws If a database error occurs.
 */
export function insertEngineGame(record: EngineGamesRecord): void {
	const query = `
		INSERT INTO engine_games (
			game_id, player_number, score, clock_at_end_millis,
			engine, engine_version, strength_level
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	db.run(query, [
		record.game_id, record.player_number, record.score, record.clock_at_end_millis,
		record.engine, record.engine_version, record.strength_level,
	]); // prettier-ignore
}

/**
 * Fetches the requested columns of every engine_games row for a single game.
 * @returns One row per engine participant, ordered by player_number.
 * @throws If invalid arguments are provided, or if a database error occurs.
 */
export function getEngineGamesOfGame<K extends EngineGamesColumn>(
	game_id: number,
	columns: K[],
): Pick<EngineGamesRecord, K>[] {
	return dbCall(() => {
		if (!Array.isArray(columns)) {
			throw new Error(`When getting engine_games data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`); // prettier-ignore
		}
		// prettier-ignore
		if (!columns.every((column) => typeof column === 'string' && allEngineGamesColumns.includes(column))) {
			throw new Error(`Invalid columns requested from engine_games table: ${jsutil.ensureJSONString(columns)}`);
		}

		return db.all<Pick<EngineGamesRecord, K>>(
			`SELECT ${columns.join(', ')} FROM engine_games WHERE game_id = ? ORDER BY player_number`,
			[game_id],
		);
	}, `Error getting engine participants for game ${game_id}`);
}
