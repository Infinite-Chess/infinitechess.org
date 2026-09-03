// src/server/database/chatEntriesManager.ts

/**
 * This script handles queries to the chat_entries table, which permanently stores every
 * game chat's typed messages and static event notices, interleaved in one ordered log.
 *
 * Rows are written as they arrive, so a live chat survives a server restart.
 */

import type { Player } from '../../shared/chess/util/typeutil.js';

import db from './database.js';

// Types -----------------------------------------------------------------------

/** Structure of a complete chat_entries record. */
interface ChatEntriesRecord extends ChatEntryData {
	/**
	 * Orders the log. A sort key, not a position — every game
	 * shares one sequence, so a single game's ids have gaps
	 */
	message_id: number;
}

/** Chat entry columns, excluding the primary key SQLite assigns. */
export interface ChatEntryData {
	game_id: number;
	/** The sender, or the player a notice is about. */
	player_number: Player;
	/** The typed text; null for a notice (complementary to {@link notice}). */
	message: string | null;
	/** The event code; null for a message (complementary to {@link message}). */
	notice: string | null;
	/** Epoch ms the server recorded it. */
	sent_at: number;
}

// Methods ---------------------------------------------------------------------

/**
 * Inserts one entry.
 * @throws If a database error occurs.
 */
function insert(record: ChatEntryData): void {
	const query = `
		INSERT INTO chat_entries (game_id, player_number, message, notice, sent_at)
		VALUES (?, ?, ?, ?, ?)
	`;
	db.call(
		() =>
			db.run(query, [
				record.game_id,
				record.player_number,
				record.message,
				record.notice,
				record.sent_at,
			]),
		`Error inserting chat entry for game ${record.game_id}`,
	);
}

/**
 * Fetches a game's whole chat log, sorted oldest to newest.
 * @throws If a database error occurs.
 */
function getOfGame(game_id: number): ChatEntriesRecord[] {
	return db.call(() => {
		const query = 'SELECT * FROM chat_entries WHERE game_id = ? ORDER BY message_id';
		return db.all<ChatEntriesRecord>(query, [game_id]);
	}, `Error getting chat entries for game ${game_id}`);
}

/**
 * How many entries a game's log holds.
 * @throws If a database error occurs.
 */
function countOfGame(game_id: number): number {
	return db.call(() => {
		const query = 'SELECT COUNT(*) AS count FROM chat_entries WHERE game_id = ?';
		return db.get<{ count: number }>(query, [game_id])!.count;
	}, `Error counting chat entries of game ${game_id}`);
}

/**
 * Deletes a game's whole chat log.
 * @throws If a database error occurs.
 */
function removeOfGame(game_id: number): void {
	db.call(
		() => db.run('DELETE FROM chat_entries WHERE game_id = ?', [game_id]),
		`Error deleting chat entries of game ${game_id}`,
	);
}

// Exports ---------------------------------------------------------------------

export default { insert, getOfGame, countOfGame, removeOfGame };
