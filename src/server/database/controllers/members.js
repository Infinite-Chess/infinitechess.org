
/**
 * This script contains all of the queries we used to interact with the members table!
 * 
 * Queries should NOT be made to the members table outside of this script!
 */

import { logEvents } from '../../middleware/logEvents.js';
import db from '../database.js';
import { allMemberColumns, uniqueMemberKeys } from '../initDatabase.js';



// General SELECT/UPDATE methods ---------------------------------------------------------------------------------------



/**
 * Fetches specified columns of a single member, from either their user_id, username, or email.
 * @param {string[]} columns - The columns to retrieve (e.g., ['user_id', 'username', 'email']).
 * @param {string} searchKey - The search key to use, must be either 'user_id', 'username', or 'email'.
 * @param {string | number} searchValue - The value to search for, can be a user ID, username, or email.
 * @param {boolean} [skipErrorLogging] If true, and we encounter an error that they don't exist, we will skip logging it to the error log.
 * @returns {object} - An object with the requested columns, or an empty object if no match is found.
 */
function getMemberDataByCriteria(columns, searchKey, searchValue, { skipErrorLogging } = {}) {

	// Check if the searchKey is valid
	if (!uniqueMemberKeys.includes(searchKey)) {
		logEvents(`Invalid search key for mmembers table "${searchKey}". Must be one of: ${uniqueMemberKeys.join(', ')}`, 'errLog.txt', { print: true });
		return {};
	}

	// Validate columns
	const invalidColumns = columns.filter(column => !allMemberColumns.includes(column));
	if (invalidColumns.length > 0) {
		logEvents(`Invalid columns requested from members table: ${invalidColumns.join(', ')}`, 'errLog.txt', { print: true });
		return {};
	}

	// Construct SQL query
	const query = `SELECT ${columns.join(', ')} FROM members WHERE ${searchKey} = ?`;

	// Execute the query and fetch result
	const row = db.get(query, [searchValue]);

	// If no row is found, return an empty object
	if (!row) {
		if (!skipErrorLogging) logEvents(`No matches found for ${searchKey} = "${searchValue}"`, 'errLog.txt', { print: true });
		return {};
	}

	// Return the fetched row (single object)
	return row;
}


/**
 * Updates multiple column values in the members table for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object} columnsAndValues - An object containing column-value pairs to update.
 * @returns {boolean} - Returns true if the update was successful, false if no changes were made or validation failed.
 */
function updateMemberColumns(userId, columnsAndValues) {
	// Ensure columnsAndValues is an object and not empty
	if (typeof columnsAndValues !== 'object' || Object.keys(columnsAndValues).length === 0) {
		logEvents(`Invalid or empty columns and values provided for user ID "${userId}" when updating member columns!`, 'errLog.txt', { print: true });
		return false;
	}

	for (const column in columnsAndValues) {
		// Validate all provided columns
		if (!allMemberColumns.includes(column)) {
			logEvents(`Invalid column "${column}" provided for user ID "${userId}" when updating member columns!`, 'errLog.txt', { print: true });
			return false;
		}
		// Convert objects (e.g., JSON) to strings for storage
		if (typeof columnsAndValues[column] === 'object' && columnsAndValues[column] !== null) {
			columnsAndValues[column] = JSON.stringify(columnsAndValues[column]);
		}
	}

	// Dynamically build the SET part of the query
	const setStatements = Object.keys(columnsAndValues).map(column => `${column} = ?`).join(', ');
	const values = Object.values(columnsAndValues);

	// Add the userId as the last parameter for the WHERE clause
	values.push(userId);

	// Update query to modify multiple columns
	const updateQuery = `UPDATE members SET ${setStatements} WHERE user_id = ?`;
	const result = db.run(updateQuery, values);

	// Check if the update was successful
	if (result.changes > 0) return true;
	else {
		logEvents(`No changes made when updating columns ${JSON.stringify(columnsAndValues)} for member with id "${userId}"!`, 'errLog.txt', { print: true });
		return false;
	}
}



// Login Count & Last Seen ---------------------------------------------------------------------------------------



/**
 * Increments the login count and updates the last_seen column for a member based on their user ID.
 * @param {number} userId - The user ID of the member.
 * @returns {object} - The result of the database operation or an error message: { success (boolean), message (string), result }
 */
function updateLoginCountAndLastSeen(userId) {
	// SQL query to update the login_count and last_seen fields
	const query = `
		UPDATE members
		SET login_count = login_count + 1, last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;

	// Execute the query with the provided userId
	const result = db.run(query, [userId]);

	if (result.changes === 0) logEvents(`No changes made when updating login_count and last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true });
}

/**
 * Updates the last_seen column for a member based on their user ID.
 * @param {number} userId - The user ID of the member.
 * @returns {object} - The result of the database operation or an error message: { success (boolean), message (string), result }
 */
function updateLastSeen(userId) {
	// SQL query to update the last_seen field
	const query = `
		UPDATE members
		SET last_seen = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`;

	// Execute the query with the provided userId
	const result = db.run(query, [userId]);

	if (result.changes === 0) logEvents(`No changes made when updating last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true });
}



export {
	getMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	updateLastSeen,
};
