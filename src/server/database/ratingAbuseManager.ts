// src/server/database/ratingAbuseManager.ts

/**
 * This script handles queries to the rating_abuse table.
 */

import jsutil from '../../shared/util/jsutil.js';

import db, { dbCall } from './database.js';
import { allRatingAbuseColumns } from './databaseTables.js';

// Types ----------------------------------------------------------------------------------------------

/** Structure of a complete rating_abuse record. */
interface RatingAbuseRecord {
	user_id: number;
	leaderboard_id: number;
	game_count_since_last_check: number | null;
	last_alerted_at: string | null;
}

type RatingAbuseColumn = keyof RatingAbuseRecord;

// Methods --------------------------------------------------------------------------------------------

/**
 * Adds an entry to the rating_abuse table.
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard
 * @throws If a database error occurs.
 */
function addEntryToRatingAbuseTable(user_id: number, leaderboard_id: number): void {
	const query = `
		INSERT INTO rating_abuse (
			user_id,
			leaderboard_id
		) VALUES (?, ?)
	`;
	dbCall(
		() => db.run(query, [user_id, leaderboard_id]),
		`Error adding entry to rating_abuse table for user "${user_id}" and leaderboard "${leaderboard_id}"`,
	);
}

/**
 * Checks if an entry exists in the rating_abuse table.
 * Relies on the composite primary key (user_id, leaderboard_id).
 * @param user_id - The ID of the user to check.
 * @param leaderboard_id - The ID of the leaderboard to check within.
 * @returns True if the player exists on the specified leaderboard, false otherwise (including on error).
 */
function isEntryInRatingAbuseTable(user_id: number, leaderboard_id: number): boolean {
	const query = `
        SELECT 1
        FROM rating_abuse
        WHERE user_id = ? AND leaderboard_id = ?
        LIMIT 1;
    `;
	const result = dbCall(
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
function getRatingAbuseData<K extends RatingAbuseColumn>(
	user_id: number,
	leaderboard_id: number,
	columns: K[],
): Pick<RatingAbuseRecord, K> {
	return dbCall(() => {
		// Validate the arguments...
		if (!Array.isArray(columns))
			throw new Error(
				`When getting rating_abuse data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`,
			);
		if (
			!columns.every(
				(column) => typeof column === 'string' && allRatingAbuseColumns.includes(column),
			)
		)
			throw new Error(
				`Invalid columns requested from rating_abuse table: ${jsutil.ensureJSONString(columns)}`,
			);

		// Move onto the SQL query
		const query = `SELECT ${columns.join(', ')} FROM rating_abuse WHERE user_id = ? AND leaderboard_id = ?`;
		const row = db.get<Pick<RatingAbuseRecord, K>>(query, [user_id, leaderboard_id]);
		if (!row)
			throw new Error(
				`No matches found in rating_abuse table for user_id = ${user_id} and leaderboard_id = ${leaderboard_id}.`,
			);
		return row;
	}, `Error when getting rating_abuse entry of user_id ${user_id} and leaderboard_id = ${leaderboard_id}`);
}

/**
 * Updates multiple column values in the rating_abuse table for a given user.
 *
 * @param user_id - The user ID of the player.
 * @param leaderboard_id - The leaderboard_id
 * @param columnsAndValues - An object containing column-value pairs to update.
 * @returns A result object indicating success or failure.
 * @throws If invalid arguments are provided or if a database error occurs.
 */
function updateRatingAbuseColumns(
	user_id: number,
	leaderboard_id: number,
	columnsAndValues: Partial<RatingAbuseRecord>,
): void {
	dbCall(() => {
		// Validate the arguments...
		if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0)
			throw new Error(
				`Invalid or empty columns and values provided for user ID "${user_id}" and leaderboard ID "${leaderboard_id}" when updating rating_abuse columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`,
			);
		for (const column in columnsAndValues) {
			// Validate all provided columns
			if (!allRatingAbuseColumns.includes(column))
				throw new Error(
					`Invalid column "${column}" provided for user ID "${user_id}" and leaderboard ID "${leaderboard_id}" when updating rating_abuse columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`,
				);
		}

		// Move on to the SQL query
		const setStatements = Object.keys(columnsAndValues)
			.map((column) => `${column} = ?`)
			.join(', ');
		const values = Object.values(columnsAndValues);
		values.push(user_id, leaderboard_id);
		const updateQuery = `UPDATE rating_abuse SET ${setStatements} WHERE user_id = ? AND leaderboard_id = ?`;
		const result = db.run(updateQuery, values);
		if (result.changes === 0)
			throw new Error(
				`No changes made when updating rating_abuse table columns ${JSON.stringify(columnsAndValues)} for entry with user ID "${user_id}" and leaderboard ID "${leaderboard_id}".`,
			);
	}, `Error updating rating_abuse table columns for user ID "${user_id}" and leaderboard ID "${leaderboard_id}"`);
}

// Exports --------------------------------------------------------------------------------------------

export {
	addEntryToRatingAbuseTable,
	isEntryInRatingAbuseTable,
	getRatingAbuseData,
	updateRatingAbuseColumns,
};
