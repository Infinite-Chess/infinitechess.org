// src/server/database/livePlayerGamesManager.ts

/**
 * This script manages the live_player_games table, which persists per-player
 * state for active games across server restarts. One row per player per game.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the column reference.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allLivePlayerGamesColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete live_player_games record. */
export interface LivePlayerGamesRecord extends LivePlayerData {
	game_id: number;
	player_number: number;
}

/** Per-player live game data columns, excluding the composite key fields. */
export interface LivePlayerData extends LivePlayerDisconnectData {
	user_id: number | null;
	browser_id: string;
	last_draw_offer_ply: number | null;
	time_remaining_ms: number | null;
}

/** Disconnect-state columns shared by live_player_games rows. */
export interface LivePlayerDisconnectData {
	disconnect_cushion_end_time: number | null;
	/** Epoch ms from which the opponent may claim victory/draw against this player. NULL if no claim window. */
	disconnect_claim_time: number | null;
	/** 0 = network interruption (60s), 1 = intentional (10s). NULL if connected. */
	disconnect_voluntary: 0 | 1 | null;
}

// Methods --------------------------------------------------------------------------------------------

/**
 * Inserts a new live player game row into the database.
 * @param record - The complete live_player_games record to insert.
 * @throws If a database error occurs.
 */
export function insertLivePlayerGame(record: LivePlayerGamesRecord): void {
	const query = `
		INSERT INTO live_player_games (
			game_id, player_number, user_id, browser_id,
			last_draw_offer_ply, time_remaining_ms,
			disconnect_cushion_end_time, disconnect_claim_time, disconnect_voluntary
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	dbCall(
		() =>
			db.run(query, [
				record.game_id,
				record.player_number,
				record.user_id,
				record.browser_id,
				record.last_draw_offer_ply,
				record.time_remaining_ms,
				record.disconnect_cushion_end_time,
				record.disconnect_claim_time,
				record.disconnect_voluntary,
			]),
		`Error inserting live player game (game_id=${record.game_id}, player=${record.player_number})`,
	);
}

/**
 * Updates specific columns of a player's live game record.
 * @param game_id - The game ID.
 * @param player_number - The player number to update.
 * @param updates - An object containing only the columns to update and their new values.
 * @throws If a database error occurs.
 */
export function updateLivePlayerGame(
	game_id: number,
	player_number: number,
	updates: Partial<LivePlayerData>,
): void {
	dbCall(() => {
		// Validate the input structure...
		if (typeof updates !== 'object' || updates === null || Object.keys(updates).length === 0)
			throw new Error(`Invalid or empty updates provided when updating live player game (game_id=${game_id}, player=${player_number})! Received: ${jsutil.ensureJSONString(updates)}`); // prettier-ignore
		const entries = Object.entries(updates);
		if (!entries.every(([col]) => allLivePlayerGamesColumns.includes(col)))
			throw new Error(`Invalid columns provided when updating live player game (game_id=${game_id}, player=${player_number})! Received: ${jsutil.ensureJSONString(updates)}`); // prettier-ignore

		// Move on to the SQL query
		const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
		const values = entries.map(([, val]) => val ?? null);
		const query = `UPDATE live_player_games SET ${setClauses} WHERE game_id = ? AND player_number = ?`;
		db.run(query, [...values, game_id, player_number]);
	}, `Error updating live player game (game_id=${game_id}, player=${player_number})`);
}

/** Retrieves every live human participant for startup restoration. */
export function getAllLivePlayerGames(): LivePlayerGamesRecord[] {
	return dbCall(
		() => db.all<LivePlayerGamesRecord>('SELECT * FROM live_player_games ORDER BY game_id, player_number'), // prettier-ignore
		'Error retrieving all live player games',
	);
}
