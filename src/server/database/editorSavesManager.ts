// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */

import type { RunResult } from 'better-sqlite3';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Types -------------------------------------------------------------------------------

/** Represents a saved position list record (name, piece_count, timestamp). */
type EditorSavesListRecord = {
	name: string;
	piece_count: number;
	timestamp: number;
};

/** Represents a saved position ICN record (icn, pawn_double_push, castling, compression). */
type EditorSavesIcnRecord = {
	timestamp: number;
	compression: string;
	icn: string;
	/** -1 = Indeterminate tristate */
	pawn_double_push: -1 | 0 | 1;
	/** -1 = Indeterminate tristate */
	castling: -1 | 0 | 1;
};

// Constants ---------------------------------------------------------------------------------

/** Maximum number of saved positions allowed per user */
const MAX_SAVED_POSITIONS = 50;

// Methods -----------------------------------------------------------------------------

/**
 * Retrieves all saved positions for a given user_id.
 * Returns only name, piece_count, and timestamp columns.
 * @throws If a database error occurs.
 */
function getAllSavedPositionsForUser(user_id: number): EditorSavesListRecord[] {
	try {
		const query = `SELECT name, piece_count, timestamp FROM editor_saves WHERE user_id = ?`;
		return db.all<EditorSavesListRecord>(query, [user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error retrieving saved positions for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
}

/**
 * Counts how many saved positions a user currently has.
 * @throws If a database error occurs.
 */
function getSavedPositionCount(user_id: number): number {
	try {
		const query = `SELECT COUNT(*) AS count FROM editor_saves WHERE user_id = ?`;
		const row = db.get<{ count: number }>(query, [user_id]);
		return row?.count ?? 0;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error counting saved positions for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
}

/**
 * Checks whether a user already has a saved position with the given name.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @returns True if a matching saved position exists.
 * @throws If a database error occurs.
 */
function doesSavedPositionExist(user_id: number, name: string): boolean {
	try {
		const query = `
			SELECT EXISTS(
				SELECT 1 FROM editor_saves
				WHERE user_id = ? AND name = ?
			) AS found
		 `;
		const row = db.get<{ found: 0 | 1 }>(query, [user_id, name]);
		return Boolean(row?.found);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error checking existence of saved position "${name}" for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
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
 * @returns The RunResult.
 * @throws If a database error occurs.
 */
function addSavedPosition(
	user_id: number,
	name: string,
	piece_count: number,
	timestamp: number,
	icn: string,
	compression: string,
	pawn_double_push?: boolean,
	castling?: boolean,
): void {
	try {
		// Insert the record (overwrites any existing one)
		const insertQuery = `
            INSERT OR REPLACE INTO editor_saves (user_id, name, piece_count, timestamp, icn, compression, pawn_double_push, castling)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
		db.run(insertQuery, [
			user_id,
			name,
			piece_count,
			timestamp,
			icn,
			compression,
			// Encode tristate
			pawn_double_push === undefined ? -1 : pawn_double_push ? 1 : 0,
			castling === undefined ? -1 : castling ? 1 : 0,
		]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error adding saved position for user_id ${user_id} with name "${name}": ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
}

/**
 * Retrieves the ICN notation, pawn_double_push, and castling for a specific saved position by name and user_id.
 * @param name - The position name
 * @param user_id - The user ID who owns the position
 * @returns The ICN record if found and owned by the user, otherwise undefined.
 * @throws If a database error occurs.
 */
function getSavedPositionICN(name: string, user_id: number): EditorSavesIcnRecord | undefined {
	try {
		const query = `SELECT timestamp, icn, compression, pawn_double_push, castling FROM editor_saves WHERE name = ? AND user_id = ?`;
		return db.get<EditorSavesIcnRecord>(query, [name, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error retrieving ICN for name "${name}" and user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
}

/**
 * Deletes a saved position by name and user_id.
 * Will fail to delete if the user_id doesn't match the position owner.
 * @param name - The position name
 * @param user_id - The user ID who owns the position
 * @returns The RunResult containing the number of changes.
 * @throws If a database error occurs.
 */
function deleteSavedPosition(name: string, user_id: number): RunResult {
	try {
		const query = `DELETE FROM editor_saves WHERE name = ? AND user_id = ?`;
		return db.run(query, [name, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.stack : String(error);
		logEventsAndPrint(
			`Error deleting position "${name}" for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw error; // Rethrow
	}
}

export default {
	// Constants
	MAX_SAVED_POSITIONS,
	// Methods
	getAllSavedPositionsForUser,
	getSavedPositionCount,
	doesSavedPositionExist,
	addSavedPosition,
	getSavedPositionICN,
	deleteSavedPosition,
};
