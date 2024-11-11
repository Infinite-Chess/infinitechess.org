


import { refreshTokenExpirySecs } from './authController.js';
import { logEvents } from '../../middleware/logEvents.js';
import db from '../database.js';
import { getRefreshTokenPayload } from './refreshTokenController.js';
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


// Refresh Tokens ---------------------------------------------------------------------------------------

/**
 * Retrieves the user ID and username from a refresh token.
 * This does NOT test it we have manually invalidated it if they logged out early!!
 * @param {string} refreshToken - The refresh token to decode.
 * @returns {object} - An object: { user_id, username } if valid, or {} if the token is invalid, WAS invalidated, or expired.
 */
function getUserIDAndUsernameFromRefreshToken(refreshToken) {
	const payload = getRefreshTokenPayload(refreshToken);
	// If the token is invalid or expired, return null
	if (!payload) return {};
	// Extract user ID and username from the payload
	const { username, user_id } = payload;
	// Return the user ID and username
	return { user_id, username };
}

/**
 * Fetches the refresh tokens for a given user ID.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched.
 * @returns {object[]|undefined} - An array of all their refresh tokens: [ { token, expires }, { token, expires }, ...], or undefined if the member doesn't exist
 */
function getRefreshTokensByUserID(userId) {
	let { refresh_tokens } = getMemberDataByCriteria(['refresh_tokens'], 'user_id', userId);
	// If the user exists but has null or no refresh tokens, return an empty array.
	if (refresh_tokens === null) refresh_tokens = '[]';
	// If the user doesn't exist (row is undefined), return undefined.
	if (refresh_tokens === undefined) return logEvents(`Cannot get refresh tokens of a non-existent member of id "${userId}"!`);
	return Object.parse(refresh_tokens);
}

/**
 * Fetches the refresh tokens for a given user ID, removes any expired tokens,
 * updates the database with the new list of valid tokens, and returns the updated list.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched and updated.
 * @returns {object[]|undefined} - The updated array of valid refresh tokens: [ { token, expires }, { token, expires }, ... ], or undefined if the member doesn't exist.
 */
function getRefreshTokensByUserID_DeleteExpired(userId) {
	// Step 1: Fetch the current refresh tokens for the user
	const refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot get refresh tokens (and delete expired) of a non-existent member of id "${userId}"!`);

	// Step 2: Remove expired tokens
	const validRefreshTokens = removeExpiredTokens(refreshTokens);

	// Step 3: If the list of valid tokens has changed, save the new list
	if (refreshTokens.length !== validRefreshTokens.length) saveRefreshTokens(userId, validRefreshTokens);

	// Step 4: Return the array of valid refresh tokens
	return validRefreshTokens;
}

/**
 * Adds a new refresh token in the database to the refresh_tokens column for a member.
 * @param {number} userId - The user ID of the member.
 * @param {string} newToken - The new refresh token to add.
 */
function addRefreshToken(userId, newToken) {
	// Get the current refresh tokens
	let refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot add refresh token to non-existent member with id "${userId}"!`, 'errLog.txt', { print: true });

	// Remove any expired tokens
	refreshTokens = removeExpiredTokens(refreshTokens);

	// Add the new token to the list
	refreshTokens = addTokenToRefreshTokens(refreshTokens, newToken);

	saveRefreshTokens(userId, refreshTokens);

	// Use the updateMemberColumn function to update the refresh_tokens column
	const updateResult = updateMemberColumns(userId, { refresh_tokens: refreshTokens });

	// If no changes were made, log the event
	if (!updateResult) logEvents(`No changes made when adding refresh token to member with id "${userId}"!`, 'errLog.txt', { print: true });
}

/**
 * Deletes a specific refresh token in the database for a user based on their user_id.
 * @param {number} userId - The user ID of the member whose refresh token is to be deleted.
 * @param {string} refreshToken - The refresh token to be deleted from the user's refresh_tokens column.
 */
function deleteRefreshToken(userId, refreshToken) {
	// Fetch the current refresh tokens for the user
	const refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot delete refresh token from non-existent member with id "${userId}"!`, 'errLog.txt', { print: true });

	// Remove any expired tokens. Do this whenever we read and write it.
	let newRefreshTokens = removeExpiredTokens(refreshTokens);

	// Remove the specified refresh token from the array
	newRefreshTokens = newRefreshTokens.filter(token => token.token !== refreshToken);

	// Save the updated refresh tokens
	if (newRefreshTokens.length !== refreshTokens.length) saveRefreshTokens(userId, refreshTokens);
	else logEvents(`Unable to find refresh token to delete of member with id "${userId}"!`);
}

/**
 * Updates the refresh tokens for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object[]} refreshTokens - The new array of refresh tokens to save.
 */
function saveRefreshTokens(userId, refreshTokens) {
	// If the refreshTokens array is empty, set it to null
	if (refreshTokens.length === 0) refreshTokens = null;
	// Update the refresh_tokens column
	const updateResult = updateMemberColumns(userId, { refresh_tokens: refreshTokens });
	// If no changes were made, log the event
	if (!updateResult) logEvents(`No changes made when saving refresh_tokens of member with id "${userId}"!`);
}

/**
 * Adds a new refresh token to a parsed array of existing refresh tokens.
 * @param {Object[]} refreshTokens - The array of existing refresh tokens.
 * @param {string} newToken - The new refresh token to add.
 * @returns {Object[]} - The updated array of refresh tokens.
 */
function addTokenToRefreshTokens(refreshTokens, newToken) {
	// Create the new refresh token object
	const newRefreshToken = {
		token: newToken,
		expires: Date.now() + (refreshTokenExpirySecs * 1000) // Expiry in milliseconds
	};
	
	// Add the new token to the array
	refreshTokens.push(newRefreshToken);
	
	// Return the updated array
	return refreshTokens;
}

/**
 * Removes expired refresh tokens from the array of existing refresh tokens.
 * @param {Object[]} refreshTokens - The array of existing refresh tokens: [ { token, expires }, { token, expires }, ...]
 * @returns {Object[]} - The updated array with expired tokens removed.
 */
function removeExpiredTokens(refreshTokens) {
	const currentTime = Date.now();
	// Filter out tokens that have expired
	return refreshTokens.filter(tokenObj => tokenObj.expires > currentTime);
}



// Verification ---------------------------------------------------------------------------------------



export {
	getMemberDataByCriteria,
	updateMemberColumns,
	updateLoginCountAndLastSeen,
	removeExpiredTokens,
	addRefreshToken,
	deleteRefreshToken,
	updateLastSeen,
	getUserIDAndUsernameFromRefreshToken,
};
