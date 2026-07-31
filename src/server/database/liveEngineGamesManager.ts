// src/server/database/liveEngineGamesManager.ts

/**
 * Manages live engine participants. They omit disconnect state because engines never disconnect.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allLiveEngineGamesColumns } from './databaseTables.js';

interface LiveEngineGameData {
	time_remaining_ms: number | null;
	engine: string;
	engine_version: string;
	strength_level: number;
}

export interface LiveEngineGamesRecord extends LiveEngineGameData {
	game_id: number;
	player_number: number;
}

export function insertLiveEngineGame(record: LiveEngineGamesRecord): void {
	const query = `
		INSERT INTO live_engine_games (
			game_id, player_number, time_remaining_ms,
			engine, engine_version, strength_level
		) VALUES (?, ?, ?, ?, ?, ?)
	`;
	dbCall(
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

export function updateLiveEngineGame(
	game_id: number,
	player_number: number,
	updates: Partial<LiveEngineGameData>,
): void {
	dbCall(() => {
		const entries = Object.entries(updates);
		if (
			entries.length === 0 ||
			!entries.every(([column]) => allLiveEngineGamesColumns.includes(column))
		)
			throw new Error(`Invalid live engine updates: ${jsutil.ensureJSONString(updates)}`);
		const setClauses = entries.map(([column]) => `${column} = ?`).join(', ');
		db.run(
			`UPDATE live_engine_games SET ${setClauses} WHERE game_id = ? AND player_number = ?`,
			[...entries.map(([, value]) => value), game_id, player_number],
		);
	}, `Error updating live engine participant for game ${game_id}`);
}

export function getAllLiveEngineGames(): LiveEngineGamesRecord[] {
	return dbCall(
		() => db.all<LiveEngineGamesRecord>('SELECT * FROM live_engine_games'),
		'Error retrieving live engine participants',
	);
}
