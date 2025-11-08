// src/server/database/editorSavesManager.ts

/**
 * This module manages saved positions in the editor_saves table.
 */


import db from './database.js';

import type { RunResult } from 'better-sqlite3';


/**
 * Represents a saved position list record (position_id, name, size only).
 */
export type EditorSavesListRecord = {
	position_id: number;
	name: string;
	size: number;
};

/**
 * Represents a saved position ICN record (icn and user_id).
 */
export type EditorSavesIcnRecord = {
	icn: string;
	user_id: number;
};


/**
 * Retrieves all saved positions for a given user_id.
 * Returns only position_id, name, and size columns.
 * @param user_id - The user ID
 * @returns An array of saved positions.
 */
export function getAllSavedPositionsForUser(user_id: number): EditorSavesListRecord[] {
	const query = `SELECT position_id, name, size FROM editor_saves WHERE user_id = ?`;
	return db.all<EditorSavesListRecord>(query, [user_id]);
}

/**
 * Adds a new saved position to the editor_saves table.
 * The position_id will be auto-generated.
 * @param user_id - The user ID who owns the position
 * @param name - The name of the saved position
 * @param size - The size (piece count) of the position
 * @param icn - The ICN notation of the position
 * @returns The RunResult containing lastInsertRowid.
 */
export function addSavedPosition(user_id: number, name: string, size: number, icn: string): RunResult {
	const query = `
		INSERT INTO editor_saves (user_id, name, size, icn)
		VALUES (?, ?, ?, ?)
	`;
	return db.run(query, [user_id, name, size, icn]);
}

/**
 * Retrieves the ICN notation and user_id for a specific saved position by position_id.
 * @param position_id - The position ID
 * @returns The ICN and user_id record if found, otherwise undefined.
 */
export function getSavedPositionIcn(position_id: number): EditorSavesIcnRecord | undefined {
	const query = `SELECT icn, user_id FROM editor_saves WHERE position_id = ?`;
	return db.get<EditorSavesIcnRecord>(query, [position_id]);
}

/**
 * Gets the count of saved positions for a given user_id.
 * @param user_id - The user ID
 * @returns The number of saved positions the user has.
 */
export function getSavedPositionCount(user_id: number): number {
	const query = `SELECT COUNT(*) as count FROM editor_saves WHERE user_id = ?`;
	const result = db.get<{ count: number }>(query, [user_id]);
	return result?.count ?? 0;
}
