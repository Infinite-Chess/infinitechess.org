// src/server/database/engineGamesManager.ts

/**
 * Manages permanent engine participants. One row mirrors one player_games participant.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allEngineGamesColumns } from './databaseTables.js';

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

export function insertEngineGame(record: EngineGamesRecord): void {
	const query = `
		INSERT INTO engine_games (
			game_id, player_number, score, clock_at_end_millis,
			engine, engine_version, strength_level
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`;
	dbCall(
		() =>
			db.run(query, [
				record.game_id,
				record.player_number,
				record.score,
				record.clock_at_end_millis,
				record.engine,
				record.engine_version,
				record.strength_level,
			]),
		`Error inserting engine participant for game ${record.game_id}`,
	);
}

export function getEngineGamesForGame<K extends EngineGamesColumn>(
	game_id: number,
	columns: K[],
): Pick<EngineGamesRecord, K>[] {
	return dbCall(() => {
		if (!columns.every((column) => allEngineGamesColumns.includes(column)))
			throw new Error(
				`Invalid columns requested from engine_games: ${jsutil.ensureJSONString(columns)}`,
			);
		return db.all<Pick<EngineGamesRecord, K>>(
			`SELECT ${columns.join(', ')} FROM engine_games WHERE game_id = ? ORDER BY player_number`,
			[game_id],
		);
	}, `Error getting engine participants for game ${game_id}`);
}
