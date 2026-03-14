// src/server/database/livePlayerGamesManager.ts

/**
 * This script manages the live_player_games table, which persists per-player
 * state for active games across server restarts. One row per player per game.
 *
 * This script is ONLY responsible for table operations (insert, update, delete, query).
 * The logic for computing column values from ServerGame state lives in liveGameValues.ts.
 */

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete live_player_games record. */
export interface LivePlayerGamesRecord extends LivePlayerData {
	game_id: number;
	player_number: number;
}

/** Per-player live game data columns, excluding the composite key fields. */
export interface LivePlayerData {
	user_id: number | null;
	browser_id: string;
	elo: string | null;
	last_draw_offer_ply: number | null;
	time_remaining_ms: number | null;
	disconnect_cushion_end_time: number | null;
	disconnect_resign_time: number | null;
	/** 0 = network interruption (60s), 1 = intentional (20s). NULL if connected. */
	disconnect_by_choice: 0 | 1 | null;
}

// SQL Queries (prepared once, cached by db module) ---------------------------------------------------

const INSERT_QUERY = `
	INSERT INTO live_player_games (
		game_id, player_number, user_id, browser_id, elo,
		last_draw_offer_ply, time_remaining_ms,
		disconnect_cushion_end_time, disconnect_resign_time, disconnect_by_choice
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SELECT_BY_GAME_QUERY = `SELECT * FROM live_player_games WHERE game_id = ? ORDER BY player_number`;

// Methods --------------------------------------------------------------------------------------------

/**
 * Inserts a new live player game row into the database.
 * @param record - The complete live_player_games record to insert.
 */
function insertLivePlayerGame(record: LivePlayerGamesRecord): void {
	try {
		db.run(INSERT_QUERY, [
			record.game_id,
			record.player_number,
			record.user_id,
			record.browser_id,
			record.elo,
			record.last_draw_offer_ply,
			record.time_remaining_ms,
			record.disconnect_cushion_end_time,
			record.disconnect_resign_time,
			record.disconnect_by_choice,
		]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error inserting live player game (game_id=${record.game_id}, player=${record.player_number}): ${message}`,
			'errLog.txt',
		);
	}
}

/**
 * Updates specific columns of a player's live game record.
 * @param game_id - The game ID.
 * @param player_number - The player number to update.
 * @param updates - An object containing only the columns to update and their new values.
 */
function updateLivePlayerGame(
	game_id: number,
	player_number: number,
	updates: Partial<LivePlayerData>,
): void {
	const entries = Object.entries(updates);
	if (entries.length === 0) return;

	const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
	const values = entries.map(([, val]) => val ?? null);
	const query = `UPDATE live_player_games SET ${setClauses} WHERE game_id = ? AND player_number = ?`;

	try {
		db.run(query, [...values, game_id, player_number]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error updating live player game (game_id=${game_id}, player=${player_number}): ${message}`,
			'errLog.txt',
		);
	}
}

/**
 * Updates specific columns for ALL players in a live game.
 * Useful for clock updates after a move where all players' remaining time changes.
 * @param game_id - The game ID.
 * @param playerUpdates - A record mapping player number to the updates for that player.
 */
function updateAllPlayersInLiveGame(
	game_id: number,
	playerUpdates: Record<number, Partial<LivePlayerData>>,
): void {
	for (const [playerStr, updates] of Object.entries(playerUpdates)) {
		updateLivePlayerGame(game_id, Number(playerStr), updates);
	}
}

/**
 * Retrieves all player rows for a given live game. Used on server startup.
 * @param game_id - The game ID.
 * @returns An array of live_player_games records for this game.
 */
function getLivePlayerGamesForGame(game_id: number): LivePlayerGamesRecord[] {
	try {
		return db.all<LivePlayerGamesRecord>(SELECT_BY_GAME_QUERY, [game_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving live player games for game ${game_id}: ${message}`,
			'errLog.txt',
		);
		return [];
	}
}

// Exports --------------------------------------------------------------------------------------------

export {
	insertLivePlayerGame,
	updateLivePlayerGame,
	updateAllPlayersInLiveGame,
	getLivePlayerGamesForGame,
};
