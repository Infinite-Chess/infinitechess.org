import path from 'path';
import fs from 'fs';


import { fileURLToPath } from 'node:url';
import { refreshTokenExpirySecs } from './authController.js';
import { logEvents } from '../../middleware/logEvents.js';
import db from '../database.js';
import { getRefreshTokenPayload } from './refreshTokenController.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));



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

	if (result.changes === 0) logEvents(`No changes made when updating login_count and last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true })
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

	if (result.changes === 0) logEvents(`No changes made when updating last_seen for member of id "${userId}"!`, 'errLog.txt', { print: true })
}

/**
 * Fetches the refresh tokens for a given user ID.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched.
 * @returns {object[]|undefined} - An array of all their refresh tokens: [ { token, expires }, { token, expires }, ...], or undefined if the member doesn't exist
 */
function getRefreshTokensByUserID(userId) {
	// SQL query to fetch the refresh_tokens column
	const query = 'SELECT refresh_tokens FROM members WHERE user_id = ?';

	// Retrieve the refresh tokens column for the user
	const row = db.get(query, [userId]);

	// If the user exists but has null or no refresh tokens, return an empty array.
	// If the user doesn't exist (row is undefined), return undefined.
	const refresh_tokens = row ? JSON.parse(row.refresh_tokens || '[]') : undefined;
	if (refresh_tokens === undefined) logEvents(`Cannot get refresh tokens of a non-existent member of id "${userId}"!`);

	return refresh_tokens;
}


/**
 * Fetches the refresh tokens for a given user ID, removes any expired tokens,
 * updates the database with the new list of valid tokens, and returns the updated list.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched and updated.
 * @returns {object[]|undefined} - The updated array of valid refresh tokens: [ { token, expires }, { token, expires }, ... ], or undefined if the member doesn't exist.
 */
function getRefreshTokensByUserID_DeleteExpired(userId) {
	// Step 1: Fetch the current refresh tokens for the user
	let refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot get refresh tokens (and delete expired) of a non-existent member of id "${userId}"!`);

	// Step 2: Remove expired tokens
	const validRefreshTokens = removeExpiredTokens(refreshTokens);

	// Step 3: If the list of valid tokens has changed, save the new list
	if (refreshTokens.length !== validRefreshTokens.length) {
		saveRefreshTokens(userId, validRefreshTokens);
	}

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

	// SQL query to update the refresh_tokens field
	const updateQuery = `
		UPDATE members
		SET refresh_tokens = ?
		WHERE user_id = ?
	`;
	// Update the refresh_tokens field with the new stringified JSON
	db.run(updateQuery, [JSON.stringify(refreshTokens), userId]);
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


/**
 * Deletes a specific refresh token in the database for a user based on their user_id.
 * @param {number} userId - The user ID of the member whose refresh token is to be deleted.
 * @param {string} refreshToken - The refresh token to be deleted from the user's refresh_tokens column.
 */
function deleteRefreshToken(userId, refreshToken) {
	// Fetch the current refresh tokens for the user
	let refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot delete refresh token from non-existent member with id "${userId}"!`, 'errLog.txt', { print: true });

	// Remove any expired tokens. Do this whenever we read and write it.
	let newRefreshTokens = removeExpiredTokens(refreshTokens);

	// Remove the specified refresh token from the array
	newRefreshTokens = newRefreshTokens.filter(token => token.token !== refreshToken);

	// Save the updated refresh tokens
	if (newRefreshTokens.length !== refreshTokens.length) {
		saveRefreshTokens(userId, refreshTokens);
	} else logEvents(`Unable to find refresh token to delete of member with id "${userId}"!`);
}


/**
 * Updates the refresh tokens for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object[]} refreshTokens - The new array of refresh tokens to save.
 */
function saveRefreshTokens(userId, refreshTokens) {
	// Update query to save the refresh tokens
	const updateQuery = 'UPDATE members SET refresh_tokens = ? WHERE user_id = ?';
	const result = db.run(updateQuery, [JSON.stringify(refreshTokens), userId]);
	if (result.changes === 0) logEvents(`No changes made when saving refresh_tokens of member with id "${userId}"!`);
}



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
 * Fetches specific columns (e.g., username and email) of a user based on their user ID.
 * @param {number} userId - The user ID of the user to retrieve.
 * @returns {object|undefined} - An object with the selected columns or undefined if not found.
 */
function getUserUsernameEmailAndVerification(userId) {
	// SQL query to select only the username and email columns for a specific user
	const query = 'SELECT username, email, verification FROM members WHERE user_id = ?';
	// Execute the query and return the result
	const row = db.get(query, [userId]);
	if (row === undefined) logEvents(`Unable to get username, email, and verification of non-existant member of id "${userId}"!`);
	return row || {};
}

/**
 * Fetches the case-sensitive username and hashed_password of a member based on their username.
 * @param {string} username - The username of the member to retrieve, capitalization doesn't matter.
 * @returns {object} - An object containing the user_id, username, and hashed_password, or {} if the user is not found.
 */
function getUserIDAndUsernameByUsername(username) {
	console.log(`search by username "${username}"`);
	// SQL query to select the username and hashed_password
	const query = 'SELECT user_id, username FROM members WHERE username = ?';
	// Execute the query and return the result, or an empty object if not found
	const row = db.get(query, [username]);
	console.log(`found "${JSON.stringify(row)}"`);
	if (row === undefined) logEvents(`Unable to get user_id and username of non-existent user "${username}"!`);
	return row || {};
}

/**
 * Fetches the case-sensitive username and hashed_password of a member based on their username.
 * @param {string} username - The username of the member to retrieve, capitalization doesn't matter.
 * @param {boolean} [noerror] If true, and we encounter an error that they don't exist, we will skip logging it to the error log.
 * @returns {object} - An object containing the user_id, username, and hashed_password, or {} if the user is not found.
 */
function getUserIDUsernameAndPasswordByUsername(username, { noerror } = {}) {
	console.log(`search by username2 "${username}"`);
	// SQL query to select the username and hashed_password
	const query = 'SELECT user_id, username, hashed_password FROM members WHERE username = ?';
	// Execute the query and return the result, or an empty object if not found
	const row = db.get(query, [username]);
	console.log(`found "${JSON.stringify(row)}"`);
	if (row === undefined && !noerror) logEvents(`Unable to get user_id, username, and hashed_password of non-existent user "${username}"!`);
	return row || {};
}


/**
 * Fetches the user ID, username, and verification status based on the username.
 * @param {string} username - The username of the user to retrieve.
 * @param {boolean} [noerror] If true, and we encounter an error that they don't exist, we will skip logging it to the error log.
 * @returns {object|undefined} - An object with the user ID, username, and verification status, or undefined if not found.
 */
function getUserIdUsernameAndVerificationByUsername(username, { noerror } = {}) {
    // SQL query to select the user_id, username, and verification columns for a specific user
    const query = 'SELECT user_id, username, verification FROM members WHERE username = ?';
    
    // Execute the query and return the result
    const row = db.get(query, [username]);
    if (row === undefined && !noerror) logEvents(`Unable to find user with username "${username}"!`);

    return row || {};
}

/**
 * Updates the verification status for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object|null} verification - The new verification status as an object to be stringified and saved, or null if they are verified AND notified.
 */
function saveVerification(userId, verification) {
    // If verification is null, pass null to the query; otherwise, stringify the object
    const verificationToSave = (verification === null) ? null : JSON.stringify(verification);

    // Update query to save the stringified or null verification status
    const updateQuery = 'UPDATE members SET verification = ? WHERE user_id = ?';
    
    // Execute the query and update the verification status
    const result = db.run(updateQuery, [verificationToSave, userId]);
    
    // Log an event if no changes were made
    if (result.changes === 0) logEvents(`No changes made when saving verification for member with id "${userId}"! Value: "${verificationToSave}"`, 'errLog.txt', { print: true });
}


/**
 * Returns the member's username, email, and verified properties.
 * Called by our member controller when preparing to send a verification email.
 * @param {string} username - Their username, in lowercase. 
 * @returns {Object|undefined} An object containing their `username`, `email`, and `verified` properties, deep copied, or undefined if the member doesn't exist.
 */
function getInfo(username) {
	if (!doesMemberExist(username)) return;
	return {
		username: members[username].username,
		email: members[username].email,
		verified: structuredClone(members[username].verified)
	};
}



export {
	updateLoginCountAndLastSeen,
	removeExpiredTokens,
	addRefreshToken,
	deleteRefreshToken,
	getInfo,
	updateLastSeen,
	getUserIDAndUsernameFromRefreshToken,
	getUserUsernameEmailAndVerification,
	getUserIDAndUsernameByUsername,
	getUserIDUsernameAndPasswordByUsername,
	getUserIdUsernameAndVerificationByUsername,
	saveVerification,
};
