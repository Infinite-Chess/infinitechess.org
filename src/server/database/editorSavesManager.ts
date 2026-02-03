// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */

import type { RunResult } from 'better-sqlite3';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Type Definitions --------------------------------------------------------------------

/** Represents a saved position list record (name, piece_count, timestamp). */
export type EditorSavesListRecord = {
	name: string;
	piece_count: number;
	timestamp: number;
};

/** Represents a saved position ICN record (icn, pawn_double_push, castling). */
export type EditorSavesIcnRecord = {
	icn: string;
	pawn_double_push: number;
	castling: number;
};

// Constants ---------------------------------------------------------------------------------

/** Maximum number of saved positions allowed per user */
const MAX_SAVED_POSITIONS = 50;

/** Error message for when the user's save quota is exceeded. */
const QUOTA_EXCEEDED_ERROR = 'QUOTA_EXCEEDED';

/** Error message for when a position name already exists for the user. */
const NAME_ALREADY_EXISTS_ERROR = 'NAME_ALREADY_EXISTS';

// Methods -----------------------------------------------------------------------------

/**
 * Retrieves all saved positions for a given user_id.
 * Returns only name, piece_count, and timestamp columns.
 * @param user_id - The user ID
 * @returns An array of saved positions.
 * @throws A database error occurred while managing editor saves.
 */
function getAllSavedPositionsForUser(user_id: number): EditorSavesListRecord[] {
	try {
		const query = `SELECT name, piece_count, timestamp FROM editor_saves WHERE user_id = ?`;
		return db.all<EditorSavesListRecord>(query, [user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving saved positions for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Adds a new saved position to the editor_saves table,
 * enforcing the maximum saved positions quota per user.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @param piece_count - The client-provided piece count of the position
 * @param icn - The ICN notation of the position
 * @param timestamp - The timestamp when the position was saved
 * @param pawn_double_push - Whether pawn double push is enabled
 * @param castling - Whether castling is enabled
 * @returns The RunResult.
 * @throws QUOTA_EXCEEDED if the user has reached the maximum saved positions, NAME_ALREADY_EXISTS if the name already exists, or a generic database error.
 */
function addSavedPosition(
	user_id: number,
	name: string,
	piece_count: number,
	icn: string,
	timestamp: number,
	pawn_double_push: boolean,
	castling: boolean,
): RunResult {
	try {
		const transaction = db.transaction(() => {
			// 1. Get count within the transaction
			const countResult = db.get<{ count: number }>(
				`SELECT COUNT(*) as count FROM editor_saves WHERE user_id = ?`,
				[user_id],
			);
			const currentCount = countResult?.count ?? 0;

			// 2. Check quota
			if (currentCount >= MAX_SAVED_POSITIONS) {
				// Throw an error to roll back the transaction
				throw new Error(QUOTA_EXCEEDED_ERROR);
			}

			// 3. Insert the new record
			const insertQuery = `
            INSERT INTO editor_saves (user_id, name, piece_count, icn, timestamp, pawn_double_push, castling)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
			return db.run(insertQuery, [
				user_id,
				name,
				piece_count,
				icn,
				timestamp,
				pawn_double_push ? 1 : 0,
				castling ? 1 : 0,
			]);
		});

		return transaction();
	} catch (error: unknown) {
		const errMsg = error instanceof Error ? error.message : String(error);

		// Re-throw quota exceeded errors as-is (expected business logic failure)
		if (errMsg === QUOTA_EXCEEDED_ERROR) {
			throw error;
		}
		// Handle UNIQUE constraint violation
		if (errMsg.includes('UNIQUE constraint failed')) {
			throw new Error(NAME_ALREADY_EXISTS_ERROR);
		}
		// Log and throw generic error for all other database errors
		logEventsAndPrint(
			`Error adding saved position for user_id ${user_id} with name "${name}": ${errMsg}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Retrieves the ICN notation, pawn_double_push, and castling for a specific saved position by name and user_id.
 * @param name - The position name
 * @param user_id - The user ID who owns the position
 * @returns The ICN record if found and owned by the user, otherwise undefined.
 * @throws A database error occurred while managing editor saves.
 */
function getSavedPositionICN(name: string, user_id: number): EditorSavesIcnRecord | undefined {
	try {
		const query = `SELECT icn, pawn_double_push, castling FROM editor_saves WHERE name = ? AND user_id = ?`;
		return db.get<EditorSavesIcnRecord>(query, [name, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error retrieving ICN for name "${name}" and user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Deletes a saved position by name and user_id.
 * Will fail to delete if the user_id doesn't match the position owner.
 * @param name - The position name
 * @param user_id - The user ID who owns the position
 * @returns The RunResult containing the number of changes.
 * @throws A database error occurred while managing editor saves.
 */
function deleteSavedPosition(name: string, user_id: number): RunResult {
	try {
		const query = `DELETE FROM editor_saves WHERE name = ? AND user_id = ?`;
		return db.run(query, [name, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error deleting position "${name}" for user_id ${user_id}: ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

export default {
	// Constants
	MAX_SAVED_POSITIONS,
	QUOTA_EXCEEDED_ERROR,
	NAME_ALREADY_EXISTS_ERROR,
	// Methods
	getAllSavedPositionsForUser,
	addSavedPosition,
	getSavedPositionICN,
	deleteSavedPosition,
};
