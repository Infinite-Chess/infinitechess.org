// src/server/database/ratingAbuseManager.ts

/**
 * This script handles queries to the rating_abuse table.
 */

import db from './database.js';
import databaseTables from './databaseTables.js';

// Types --------------------------------------------------------------------------------------

/** Structure of a complete rating_abuse record. */
interface RatingAbuseRecord {
	user_id: number;
	leaderboard_id: number;
	game_count_since_last_check: number | null;
	last_alerted_at: string | null;
}

type RatingAbuseColumn = keyof RatingAbuseRecord;

// Methods ------------------------------------------------------------------------------------

/**
 * Adds an entry to the rating_abuse table.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard
 * @throws If a database error occurs.
 */
function addEntry(user_id: number, leaderboard_id: number): void {
	const query = `
		INSERT INTO rating_abuse (
			user_id,
			leaderboard_id
		) VALUES (?, ?)
	`;
	db.call(
		() => db.run(query, [user_id, leaderboard_id]),
		`Error adding entry to rating_abuse table for user "${user_id}" and leaderboard "${leaderboard_id}"`,
	);
}

/**
 * Checks if an entry exists in the rating_abuse table.
 * Relies on the composite primary key (user_id, leaderboard_id).
 * @param user_id - The ID of the user to check.
 * @param leaderboard_id - The ID of the leaderboard to check within.
 * @returns True if an entry for this player exists in the rating_abuse table, false otherwise.
 * @throws If a database error occurs.
 */
function isEntryIn(user_id: number, leaderboard_id: number): boolean {
	const query = `
        SELECT 1
        FROM rating_abuse
        WHERE user_id = ? AND leaderboard_id = ?
        LIMIT 1;
    `;
	const result = db.call(
		() => db.get<{ '1': 1 }>(query, [user_id, leaderboard_id]),
		`Error checking existence of rating_abuse entry for user "${user_id}" on leaderboard "${leaderboard_id}"`,
	);
	return !!result;
}

/**
 * Fetches specified columns of a single (user_id, leaderboard_id) from the rating_abuse table based on (user_id, leaderboard_id)
 * @param user_id - The user_id of the player
 * @param leaderboard_id - The leaderboard_id
 * @param columns - The columns to retrieve (e.g., ['game_count_since_last_check', 'last_alerted_at'])
 * @returns An object containing the requested columns.
 * @throws If invalid arguments are provided, if no match is found, or if a database error occurs.
 */
function getData<K extends RatingAbuseColumn>(
	user_id: number,
	leaderboard_id: number,
	columns: K[],
): Pick<RatingAbuseRecord, K> {
	return db.call(() => {
		db.assertColumnsValid(columns, databaseTables.ALL_RATING_ABUSE_COLUMNS, 'rating_abuse');

		const query = `SELECT ${columns.join(', ')} FROM rating_abuse WHERE user_id = ? AND leaderboard_id = ?`;
		const row = db.get<Pick<RatingAbuseRecord, K>>(query, [user_id, leaderboard_id]);
		if (!row)
			throw new Error(`No matches found in rating_abuse table for user_id = ${user_id} and leaderboard_id = ${leaderboard_id}.`); // prettier-ignore
		return row;
	}, `Error when getting rating_abuse entry of user_id ${user_id} and leaderboard_id = ${leaderboard_id}`);
}

/**
 * Updates multiple column values in the rating_abuse table for a given user.
 *
 * @param user_id - The user ID of the player.
 * @param leaderboard_id - The leaderboard_id
 * @param updates - An object containing column-value pairs to update.
 * @throws If no matching entry exists or a database error occurs.
 * @throws If invalid arguments are provided or if a database error occurs.
 */
function updateColumns(
	user_id: number,
	leaderboard_id: number,
	updates: Partial<RatingAbuseRecord>,
): void {
	db.call(() => {
		const result = db.runRowUpdate({
			tableName: 'rating_abuse',
			allowedColumns: databaseTables.ALL_RATING_ABUSE_COLUMNS,
			updates: updates,
			errorContext: `updating rating_abuse columns for user ID "${user_id}" and leaderboard ID "${leaderboard_id}"`,
			whereClause: 'user_id = ? AND leaderboard_id = ?',
			whereValues: [user_id, leaderboard_id],
		});
		if (result.changes === 0)
			throw new Error(`No changes made when updating rating_abuse table columns ${JSON.stringify(updates)} for entry with user ID "${user_id}" and leaderboard ID "${leaderboard_id}".`); // prettier-ignore
	}, `Error updating rating_abuse table columns for user ID "${user_id}" and leaderboard ID "${leaderboard_id}"`);
}

// Exports ------------------------------------------------------------------------------------

export default { addEntry, isEntryIn, getData, updateColumns };
