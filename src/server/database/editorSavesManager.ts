// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */

import db from './database.js';
import logEvents from '../utility/logEvents.js';

// Types -----------------------------------------------------------------------

/** A saved position's summary, as listed. */
type EditorSavesListRecord = {
	name: string;
	piece_count: number;
	timestamp: number;
};

/** A saved position's contents, as loaded. */
type EditorSavesPositionRecord = {
	timestamp: number;
	compression: string;
	icn: string;
	/** -1 = Indeterminate tristate */
	pawn_double_push: -1 | 0 | 1;
	/** -1 = Indeterminate tristate */
	castling: -1 | 0 | 1;
};

// Methods ---------------------------------------------------------------------

/**
 * Retrieves all saved positions for a given user_id.
 * Returns only name, piece_count, and timestamp columns.
 * @throws If a database error occurs.
 */
function getAllForUser(user_id: number): EditorSavesListRecord[] {
	const query = `SELECT name, piece_count, timestamp FROM editor_saves WHERE user_id = ?`;
	return db.call(
		() => db.all<EditorSavesListRecord>(query, [user_id]),
		`Error retrieving saved positions for user_id ${user_id}`,
	);
}

/**
 * Counts how many saved positions a user currently has.
 * @throws If a database error occurs.
 */
function getCount(user_id: number): number {
	const query = `SELECT COUNT(*) AS count FROM editor_saves WHERE user_id = ?`;
	return db.call(
		() => db.get<{ count: number }>(query, [user_id])!.count,
		`Error counting saved positions for user_id ${user_id}`,
	);
}

/**
 * Checks whether a user already has a saved position with the given name.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @returns True if a matching saved position exists.
 * @throws If a database error occurs.
 */
function doesExist(user_id: number, name: string): boolean {
	const query = `
		SELECT EXISTS(
			SELECT 1 FROM editor_saves
			WHERE user_id = ? AND name = ?
		) AS found
	 `;
	const row = db.call(
		() => db.get<{ found: 0 | 1 }>(query, [user_id, name]),
		`Error checking existence of saved position "${logEvents.escapeLogNewlines(name)}" for user_id ${user_id}`,
	);
	return Boolean(row?.found);
}

/**
 * Inserts a saved position.
 * If a position with the same name already exists, it will be overwritten.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @param piece_count - The client-provided piece count of the position
 * @param timestamp - The timestamp when the position was saved
 * @param icn - The ICN notation of the position
 * @param compression - The compression mode used for the ICN
 * @param pawn_double_push - Whether the pawn double push gamerule is enabled, or undefined if indeterminate
 * @param castling - Whether the castling gamerule is enabled, or undefined if indeterminate
 * @throws If a database error occurs.
 */
function add(
	user_id: number,
	name: string,
	piece_count: number,
	timestamp: number,
	icn: string,
	compression: string,
	pawn_double_push?: boolean,
	castling?: boolean,
): void {
	const insertQuery = `
		INSERT OR REPLACE INTO editor_saves (user_id, name, piece_count, timestamp, icn, compression, pawn_double_push, castling)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`;
	db.call(
		() =>
			db.run(insertQuery, [
				user_id,
				name,
				piece_count,
				timestamp,
				icn,
				compression,
				pawn_double_push === undefined ? -1 : pawn_double_push ? 1 : 0,
				castling === undefined ? -1 : castling ? 1 : 0,
			]),
		`Error adding saved position for user_id ${user_id} with name "${logEvents.escapeLogNewlines(name)}"`,
	);
}

/**
 * Retrieves a user's saved position by name.
 * @param user_id - The user ID who owns the position
 * @param name - The position name
 * @returns The position, or undefined if not found.
 * @throws If a database error occurs.
 */
function get(user_id: number, name: string): EditorSavesPositionRecord | undefined {
	const query = `SELECT timestamp, icn, compression, pawn_double_push, castling FROM editor_saves WHERE user_id = ? AND name = ?`;
	return db.call(
		() => db.get<EditorSavesPositionRecord>(query, [user_id, name]),
		`Error retrieving position "${logEvents.escapeLogNewlines(name)}" for user_id ${user_id}`,
	);
}

/**
 * Deletes a user's saved position by name.
 * @param user_id - The user ID who owns the position
 * @param name - The position name
 * @returns Whether the user had a position of that name to delete.
 * @throws If a database error occurs.
 */
function remove(user_id: number, name: string): boolean {
	const query = `DELETE FROM editor_saves WHERE user_id = ? AND name = ?`;
	return db.call(
		() => db.run(query, [user_id, name]).changes > 0,
		`Error deleting position "${logEvents.escapeLogNewlines(name)}" for user_id ${user_id}`,
	);
}

// Exports ---------------------------------------------------------------------

export default { getAllForUser, getCount, doesExist, add, get, remove };
