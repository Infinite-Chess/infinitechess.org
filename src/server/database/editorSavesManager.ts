// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */

import type { RunResult } from 'better-sqlite3';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Type Definitions --------------------------------------------------------------------

/** Represents a saved position list record (name, piece_count only). */
export type EditorSavesListRecord = {
	name: string;
	piece_count: number;
};

/** Represents a saved position ICN record (icn only). */
export type EditorSavesIcnRecord = {
	icn: string;
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
 * Returns only name and piece_count columns.
 * @param user_id - The user ID
 * @returns An array of saved positions.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function getAllSavedPositionsForUser(user_id: number): EditorSavesListRecord[] {
	try {
		const query = `SELECT name, piece_count FROM editor_saves WHERE user_id = ?`;
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
 * @param piece_count - The piece_count (icn length) of the position
 * @param icn - The ICN notation of the position
 * @returns The RunResult.
 * @throws {Error} QUOTA_EXCEEDED if the user has reached the maximum saved positions, NAME_ALREADY_EXISTS if the name already exists, or a generic database error.
 */
function addSavedPosition(
	user_id: number,
	name: string,
	piece_count: number,
	icn: string,
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
            INSERT INTO editor_saves (user_id, name, piece_count, icn)
            VALUES (?, ?, ?, ?)
        `;
			return db.run(insertQuery, [user_id, name, piece_count, icn]);
		});

		return transaction();
	} catch (error: unknown) {
		// Re-throw quota exceeded errors as-is (expected business logic failure)
		if (error instanceof Error && error.message === QUOTA_EXCEEDED_ERROR) {
			throw error;
		}
		// Handle UNIQUE constraint violation
		if (
			error instanceof Error &&
			error.message.includes(
				'UNIQUE constraint failed: editor_saves.user_id, editor_saves.name',
			)
		) {
			throw new Error(NAME_ALREADY_EXISTS_ERROR);
		}
		// Log and throw generic error for all other database errors
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error adding saved position for user_id ${user_id} with name "${name}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Retrieves the ICN notation for a specific saved position by name and user_id.
 * @param name - The position name
 * @param user_id - The user ID who owns the position
 * @returns The ICN record if found and owned by the user, otherwise undefined.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function getSavedPositionICN(name: string, user_id: number): EditorSavesIcnRecord | undefined {
	try {
		const query = `SELECT icn FROM editor_saves WHERE name = ? AND user_id = ?`;
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
 * @throws {Error} A database error occurred while managing editor saves.
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

/**
 * Renames a saved position by old name and user_id.
 * Will fail to rename if the user_id doesn't match the position owner or if the new name already exists.
 * @param old_name - The current name of the position
 * @param user_id - The user ID who owns the position
 * @param new_name - The new name for the saved position
 * @returns The RunResult containing the number of changes.
 * @throws {Error} NAME_ALREADY_EXISTS if the new name already exists, or a generic database error.
 */
function renameSavedPosition(old_name: string, user_id: number, new_name: string): RunResult {
	try {
		const query = `UPDATE editor_saves SET name = ? WHERE name = ? AND user_id = ?`;
		return db.run(query, [new_name, old_name, user_id]);
	} catch (error: unknown) {
		// Handle UNIQUE constraint violation
		if (
			error instanceof Error &&
			error.message.includes(
				'UNIQUE constraint failed: editor_saves.user_id, editor_saves.name',
			)
		) {
			throw new Error(NAME_ALREADY_EXISTS_ERROR);
		}
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(
			`Error renaming position "${old_name}" for user_id ${user_id} to "${new_name}": ${message}`,
			'errLog.txt',
		);
		throw new Error('A database error occurred while managing editor saves.');
	}
}

export default {
	MAX_SAVED_POSITIONS,

	// Constants
	QUOTA_EXCEEDED_ERROR,
	NAME_ALREADY_EXISTS_ERROR,
	// Methods
	getAllSavedPositionsForUser,
	addSavedPosition,
	getSavedPositionICN,
	deleteSavedPosition,
	renameSavedPosition,
};
