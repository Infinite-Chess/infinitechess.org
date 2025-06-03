/**
 * This script handles queries to the rating_abuse table. 
 */

import jsutil from '../../client/scripts/esm/util/jsutil.js';
import { logEventsAndPrint } from '../middleware/logEvents.js'; // Adjust path if needed
import db from './database.js';
import { allRatingAbuseColumns } from './databaseTables.js';

import type { RunResult } from 'better-sqlite3'; // Import necessary types


// Type Definitions -----------------------------------------------------------------------------------


/** Structure of a rating_abuse record. This is all allowed columns of a (user_id, leaderboard_id). */
interface RatingAbuseRecord {
	user_id?: number;
	leaderboard_id?: number;
	game_count_since_last_check?: number | null;
	last_alerted_at?: string | null;
}

/** The result of add/update operations */
type ModifyQueryResult = { success: true; result: RunResult } | { success: false; reason: string };


// Methods --------------------------------------------------------------------------------------------

/**
 * Adds an entry to the rating_abuse table
 * @param user_id - The id for the user
 * @param leaderboard_id - The id for the specific leaderboard
 * @returns A result object indicating success or failure.
 */
function addEntryToRatingAbuseTable(user_id: number, leaderboard_id: number): ModifyQueryResult {

	const query = `
	INSERT INTO rating_abuse (
		user_id,
		leaderboard_id
	) VALUES (?, ?)
	`; // Only inserting user_id and leaderboard_id is needed if others have DB defaults or may be NULL

	try {
		// Execute the query with the provided values
		const result = db.run(query, [user_id, leaderboard_id]);

		// Return success result
		return { success: true, result };

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEventsAndPrint(`Error adding entry to rating_abuse table for user "${user_id}" and leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt');

		// Return an error message
		// Check for specific constraint errors if possible (e.g., FOREIGN KEY failure)
		let reason = 'Failed to add entry to rating_abuse table.';
		if (error instanceof Error && 'code' in error) {
			// Example check for better-sqlite3 specific error codes
			if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
				reason = '(User ID, Leaderboard ID) does not exist in the rating_abuse table.';
			} else if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				reason = '(User ID, Leaderboard ID) already exists in the rating_abuse table.';
			}
		}
		return { success: false, reason };
	}
}

/**
 * Checks if an entry exists in the rating_abuse.
 * Relies on the composite primary key (user_id, leaderboard_id).
 * @param user_id - The ID of the user to check.
 * @param leaderboard_id - The ID of the leaderboard to check within.
 * @returns True if the player exists on the specified leaderboard, false otherwise (including on error).
 */
function isEntryInRatingAbuseTable(user_id: number, leaderboard_id: number): boolean {
	// Query to select a constant '1' if a matching row exists.
	// LIMIT 1 ensures the database can stop searching after finding the first match.
	// This is efficient, especially with the primary key index.
	const query = `
        SELECT 1
        FROM rating_abuse
        WHERE user_id = ? AND leaderboard_id = ?
        LIMIT 1;
    `;

	try {
		const result = db.get<{ '1': 1 }>(query, [user_id, leaderboard_id]);

		// If db.get returns anything (even an object like { '1': 1 }), it means a row was found.
		// If no row is found, db.get returns undefined.
		// The double negation (!!) converts a truthy value (the result object) to true,
		// and a falsy value (undefined) to false.
		return !!result;

	} catch (error: unknown) {
		// Log any potential database errors during the check
		const message = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error checking existence of rating_abuse entry for user "${user_id}" on leaderboard "${leaderboard_id}": ${message}`, 'errLog.txt');

		// On error, we cannot confirm existence, so return false.
		return false;
	}
}


/**
 * Fetches specified columns of a single (user_id, leaderboard_id) from the rating_abuse table based on (user_id, leaderboard_id)
 * @param user_id - The user_id of the player
 * @param leaderboard_id - The leaderboard_id
 * @param columns - The columns to retrieve (e.g., ['game_count_since_last_check', 'last_alerted_at'])
 * @returns - An object containing the requested columns, or undefined if no match is found.
 */
function getRatingAbuseData(user_id: number, leaderboard_id: number, columns: string[]): RatingAbuseRecord | undefined {

	// Guard clauses... Validating the arguments...

	if (!Array.isArray(columns)) {
		logEventsAndPrint(`When getting rating_abuse data, columns must be an array of strings! Received: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}
	if (!columns.every(column => typeof column === 'string' && allRatingAbuseColumns.includes(column))) {
		logEventsAndPrint(`Invalid columns requested from rating_abuse table: ${jsutil.ensureJSONString(columns)}`, 'errLog.txt');
		return undefined;
	}

	// Arguments are valid, move onto the SQL query...

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM rating_abuse WHERE user_id = ? AND leaderboard_id = ?`;

	try {
		// Execute the query and fetch result
		const row = db.get<RatingAbuseRecord>(query, [user_id, leaderboard_id]);

		// If no row is found, return undefined
		if (!row) {
			logEventsAndPrint(`No matches found in rating_abuse table for user_id = ${user_id} and leaderboard_id = ${leaderboard_id}.`, 'errLog.txt');
			return undefined;
		}

		// Return the fetched row (single object)
		return row;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error and return undefined
		logEventsAndPrint(`Error executing query when gettings rating_abuse entry of user_id ${user_id} and leaderboard_id = ${leaderboard_id}: ${message}. The query: "${query}"`, 'errLog.txt');
		return undefined;
	}
}


/**
 * Updates multiple column values in the rating_abuse table for a given user.
 * 
 * @param user_id - The user ID of the player.
 * @param leaderboard_id - The leaderboard_id
 * @param columnsAndValues - An object containing column-value pairs to update.
 * @returns - A result object indicating success or failure.
 */
function updateRatingAbuseColumns(user_id: number, leaderboard_id: number, columnsAndValues: RatingAbuseRecord): ModifyQueryResult {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		logEventsAndPrint(`Invalid or empty columns and values provided for user ID "${user_id}" and leaderboard ID "${leaderboard_id}" when updating rating_abuse columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt'); // Detailed logging for debugging
		return { success: false, reason: 'Invalid arguments.' }; // Generic error message
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allRatingAbuseColumns.includes(column)) {
			logEventsAndPrint(`Invalid column "${column}" provided for user ID "${user_id}" and leaderboard ID "${leaderboard_id}" when updating rating_abuse columns! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt'); // Detailed logging for debugging
			return { success: false, reason: 'Invalid column.' }; // Generic error message
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the user_id and leaderboard_id as the last parameters for the WHERE clause
	values.push(user_id);
	values.push(leaderboard_id);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE rating_abuse SET ${setStatements} WHERE user_id = ? AND leaderboard_id = ?`;

	try {
		// Execute the update query
		const result = db.run(updateQuery, values);

		// Check if the update was successful
		if (result.changes > 0) return { success: true, result };
		else {
			logEventsAndPrint(`No changes made when updating rating_abuse table columns ${JSON.stringify(columnsAndValues)} for entry in rating_abuse table with user ID "${user_id}" and leaderboard ID "${leaderboard_id}"! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt');
			return { success: false, reason: 'No changes made.' }; // Generic error message
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the error for debugging purposes
		logEventsAndPrint(`Error updating rating_abuse table columns ${JSON.stringify(columnsAndValues)} for user ID "${user_id}" and leaderboard ID "${leaderboard_id}": ${message}! Received: ${jsutil.ensureJSONString(columnsAndValues)}`, 'errLog.txt');
		// Return an error message
		return { success: false, reason: 'Database error.' }; // Generic error message
	}
}



// Exports --------------------------------------------------------------------------------------------


export {
	addEntryToRatingAbuseTable,
	isEntryInRatingAbuseTable,
	getRatingAbuseData,
	updateRatingAbuseColumns
};	
