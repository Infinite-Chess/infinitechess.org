// src/server/database/liveGamesManager.ts

/**
 * This script manages the live_games table, which persists active game state
 * across server restarts. One row per active game.
 */

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete live_games record. */
export interface LiveGamesRecord extends LiveGameData {
	game_id: number;
}

/** Live game data columns, excluding the primary key. */
export interface LiveGameData {
	time_created: number;
	variant: string;
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
	afk_resign_time: number | null;
	delete_time: number | null;
	/** 0 = false, 1 = true */
	position_pasted: 0 | 1;
	/** 0 = false, 1 = true */
	validate_moves: 0 | 1;
}

// SQL Queries ---------------------------------------------------------------------------------------

const INSERT_QUERY = `
	INSERT INTO live_games (
		game_id, time_created, variant, clock, rated, private,
		moves, color_ticking, clock_snapshot_time,
		draw_offer_state,
		conclusion_condition, conclusion_victor, time_ended,
		afk_resign_time, delete_time,
		position_pasted, validate_moves
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const DELETE_QUERY = `DELETE FROM live_games WHERE game_id = ?`;

const SELECT_ALL_QUERY = `SELECT * FROM live_games`;

// Methods --------------------------------------------------------------------------------------------

/**
 * Inserts a new live game row into the database.
 * @param record - The complete live_games record to insert.
 */
function insertLiveGame(record: LiveGamesRecord): void {
	try {
		db.run(INSERT_QUERY, [
			record.game_id,
			record.time_created,
			record.variant,
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
			record.afk_resign_time,
			record.delete_time,
			record.position_pasted,
			record.validate_moves,
		]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error inserting live game ${record.game_id}: ${message}`, 'errLog.txt');
	}
}

/**
 * Updates specific columns of a live game.
 * @param game_id - The game to update.
 * @param updates - An object containing only the columns to update and their new values.
 */
function updateLiveGame(game_id: number, updates: Partial<LiveGameData>): void {
	const entries = Object.entries(updates);
	if (entries.length === 0) return;

	const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
	const values = entries.map(([, val]) => val);
	const query = `UPDATE live_games SET ${setClauses} WHERE game_id = ?`;

	try {
		db.run(query, [...values, game_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error updating live game ${game_id}: ${message}`, 'errLog.txt');
	}
}

/**
 * Deletes a live game row (cascades to live_player_games).
 * @param game_id - The game to delete.
 */
function deleteLiveGame(game_id: number): void {
	try {
		db.run(DELETE_QUERY, [game_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error deleting live game ${game_id}: ${message}`, 'errLog.txt');
	}
}

/**
 * Retrieves all live game rows. Used on server startup to restore games.
 * @returns An array of all live_games records.
 */
function getAllLiveGames(): LiveGamesRecord[] {
	try {
		return db.all<LiveGamesRecord>(SELECT_ALL_QUERY);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error retrieving all live games: ${message}`, 'errLog.txt');
		return [];
	}
}

// Exports --------------------------------------------------------------------------------------------

export { insertLiveGame, updateLiveGame, deleteLiveGame, getAllLiveGames };
