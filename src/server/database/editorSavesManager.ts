
// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */


import type { RunResult } from 'better-sqlite3';

import db from './database.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';


// Type Definitions --------------------------------------------------------------------


/** Represents a saved position list record (position_id, name, size only). */
export type EditorSavesListRecord = {
	position_id: number;
	name: string;
	size: number;
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


// Methods -----------------------------------------------------------------------------


/**
 * Retrieves all saved positions for a given user_id.
 * Returns only position_id, name, and size columns.
 * @param user_id - The user ID
 * @returns An array of saved positions.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function getAllSavedPositionsForUser(user_id: number): EditorSavesListRecord[] {
	try {
		const query = `SELECT position_id, name, size FROM editor_saves WHERE user_id = ?`;
		return db.all<EditorSavesListRecord>(query, [user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error retrieving saved positions for user_id ${user_id}: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Adds a new saved position to the editor_saves table,
 * enforcing the maximum saved positions quota per user.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @param size - The size (icn length) of the position
 * @param icn - The ICN notation of the position
 * @returns The RunResult containing lastInsertRowid.
 * @throws {Error} QUOTA_EXCEEDED if the user has reached the maximum saved positions, or a generic database error.
 */
function addSavedPosition(user_id: number, name: string, size: number, icn: string): RunResult {
	try {
		const transaction = db.transaction(() => {
			// 1. Get count within the transaction
			const countResult = db.get<{ count: number }>(`SELECT COUNT(*) as count FROM editor_saves WHERE user_id = ?`, [user_id]);
			const currentCount = countResult?.count ?? 0;

			// 2. Check quota
			if (currentCount >= MAX_SAVED_POSITIONS) {
				// Throw an error to roll back the transaction
				throw new Error(QUOTA_EXCEEDED_ERROR);
			}

			// 3. Insert the new record
			const insertQuery = `
            INSERT INTO editor_saves (user_id, name, size, icn)
            VALUES (?, ?, ?, ?)
        `;
			return db.run(insertQuery, [user_id, name, size, icn]);
		});

		return transaction();
	} catch (error: unknown) {
		// Re-throw quota exceeded errors as-is (expected business logic failure)
		if (error instanceof Error && error.message === QUOTA_EXCEEDED_ERROR) {
			throw error;
		}
		// Log and throw generic error for all other database errors
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error adding saved position for user_id ${user_id} with name "${name}": ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Retrieves the ICN notation for a specific saved position by position_id and user_id.
 * @param position_id - The position ID
 * @param user_id - The user ID who owns the position
 * @returns The ICN record if found and owned by the user, otherwise undefined.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function getSavedPositionICN(position_id: number, user_id: number): EditorSavesIcnRecord | undefined {
	try {
		const query = `SELECT icn FROM editor_saves WHERE position_id = ? AND user_id = ?`;
		return db.get<EditorSavesIcnRecord>(query, [position_id, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error retrieving ICN for position_id ${position_id} and user_id ${user_id}: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Deletes a saved position by position_id and user_id.
 * Will fail to delete if the user_id doesn't match the position owner.
 * @param position_id - The position ID
 * @param user_id - The user ID who owns the position
 * @returns The RunResult containing the number of changes.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function deleteSavedPosition(position_id: number, user_id: number): RunResult {
	try {
		const query = `DELETE FROM editor_saves WHERE position_id = ? AND user_id = ?`;
		return db.run(query, [position_id, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error deleting position_id ${position_id} for user_id ${user_id}: ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while managing editor saves.');
	}
}

/**
 * Renames a saved position by position_id and user_id.
 * Will fail to rename if the user_id doesn't match the position owner.
 * @param position_id - The position ID
 * @param user_id - The user ID who owns the position
 * @param name - The new name for the saved position
 * @returns The RunResult containing the number of changes.
 * @throws {Error} A database error occurred while managing editor saves.
 */
function renameSavedPosition(position_id: number, user_id: number, name: string): RunResult {
	try {
		const query = `UPDATE editor_saves SET name = ? WHERE position_id = ? AND user_id = ?`;
		return db.run(query, [name, position_id, user_id]);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error renaming position_id ${position_id} for user_id ${user_id} to "${name}": ${message}`, 'errLog.txt');
		throw new Error('A database error occurred while managing editor saves.');
	}
}


export default {
	// Constants
	QUOTA_EXCEEDED_ERROR,
	// Methods
	getAllSavedPositionsForUser,
	addSavedPosition,
	getSavedPositionICN,
	deleteSavedPosition,
	renameSavedPosition,
};