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

	try {
		// Execute the query with the provided userId
		const result = db.run(query, [userId]);
		
		// Return success result
		return { success: true, message: `Login count and last seen updated for user ID "${userId}"`, result };

	} catch (error) {
		// Log the error and return an error message
		logEvents(`Error updating login count for user ID "${userId}": ${error.message}`, 'errLog.txt', { print: true });
		return { success: false, message: error.message };
	}
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

	try {
		// Execute the query with the provided userId
		const result = db.run(query, [userId]);
		
		// Return success result
		return { success: true, message: `Last seen updated for user ID "${userId}"`, result };

	} catch (error) {
		// Log the error and return an error message
		logEvents(`Error updating last seen for user ID "${userId}": ${error.message}`, 'errLog.txt', { print: true });
		return { success: false, message: error.message };
	}
}

/**
 * Adds a new refresh token in the database to the refresh_tokens column for a member.
 * @param {number} userId - The user ID of the member.
 * @param {string} newToken - The new refresh token to add.
 * @returns {object} - The result of the database operation or an error message: { success (boolean), message (string), result }
 */
function addRefreshToken(userId, newToken) {
	// SQL query to update the refresh_tokens field
	const updateQuery = `
		UPDATE members
		SET refresh_tokens = ?
		WHERE user_id = ?
	`;

	try {
		// Get the current refresh tokens
		let refreshTokens = getRefreshTokensByUserID(userId);

		// Remove any expired tokens. Do this whenever we read and write it.
		refreshTokens = removeExpiredTokens(refreshTokens);

		// Add the new token to the list
		refreshTokens = addTokenToRefreshTokens(refreshTokens, newToken);

		// Update the refresh_tokens field with the new stringified JSON
		const result = db.run(updateQuery, [JSON.stringify(refreshTokens), userId]);

		// Return success result
		return { success: true, message: 'Refresh token added successfully', result };

	} catch (error) {
		// Log the error and return an error message
		logEvents(`Error adding refresh token for user ID "${userId}": ${error.message}`, 'errLog.txt', { print: true });
		return { success: false, message: error.message };
	}
}

/**
 * Fetches the refresh tokens for a given user ID.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched.
 * @returns {object[]} - An array of all their refresh tokens: [ { token, expires }, { token, expires }, ...]
 */
function getRefreshTokensByUserID(userId) {
	// SQL query to fetch the refresh_tokens column
	const query = 'SELECT refresh_tokens FROM members WHERE user_id = ?';

	// Retrieve the refresh tokens column for the user
	const row = db.get(query, [userId]);

	// If no refresh tokens are found, return an empty array
	return row?.refresh_tokens ? JSON.parse(row.refresh_tokens) : []; // { { token, expires }, { token, expires }, ...}
}

/**
 * Fetches the refresh tokens for a given user ID, removes any expired tokens,
 * updates the database with the new list of valid tokens, and returns the updated list.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched and updated.
 * @returns {object[]} - The updated array of valid refresh tokens: [ { token, expires }, { token, expires }, ... ]
 */
function getRefreshTokensByUserID_DeleteExpired(userId) {
	// Step 1: Fetch the current refresh tokens for the user
	let refreshTokens = getRefreshTokensByUserID(userId);

	// Step 2: Remove expired tokens
	refreshTokens = removeExpiredTokens(refreshTokens);

	// Step 3: If the list of valid tokens has changed, save the new list
	if (refreshTokens.length !== validRefreshTokens.length) {
		saveRefreshTokens(userId, validRefreshTokens);
	}

	// Step 4: Return the array of valid refresh tokens
	return validRefreshTokens;
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
 * @returns {object} - The result of the database operation or an error message: { success (boolean), message (string), result }
 */
function deleteRefreshToken(userId, refreshToken) {
	// Fetch the current refresh tokens for the user
	let refreshTokens = getRefreshTokensByUserID(userId);

	// Remove any expired tokens. Do this whenever we read and write it.
	refreshTokens = removeExpiredTokens(refreshTokens);

	// Remove the specified refresh token from the array
	refreshTokens = refreshTokens.filter(token => token.token !== refreshToken);

	// Save the updated refresh tokens
	const saveResult = saveRefreshTokens(userId, refreshTokens);

	// Check if the update was successful

	// Check if the save was successful, if not, log the failure
	if (saveResult.success) {
		if (saveResult.changes > 0) {
			return { success: true, message: 'Refresh token deleted successfully.' };
		} else {
			logEvents(`Failed to delete the refresh token (not found) for member of id "${userId}"! This should never happen. Was it already deleted?`, 'errLog.txt', { print: true });
			return { success: false, message: 'Failed to delete the refresh token, not found.' };
		}
	} else { // Failure probably due to member not found
		logEvents(`Failed to delete the refresh token for member with id "${userId}", this should never happen: ${saveResult.message}.`, 'errLog.txt', { print: true });
		return { success: false, message: saveResult.message };
	}
}


/**
 * Updates the refresh tokens for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object[]} refreshTokens - The new array of refresh tokens to save.
 * @returns {object} - The result of the database operation or an error message: { success (boolean), message (string), changes (number) }
 */
function saveRefreshTokens(userId, refreshTokens) {
	try {
		// Update query to save the refresh tokens
		const updateQuery = 'UPDATE members SET refresh_tokens = ? WHERE user_id = ?';
		const result = db.run(updateQuery, [JSON.stringify(refreshTokens), userId]);
		// Return success
		return { success: true, message: `Success updating refresh tokens for member with id "${userId}"!`, changes: result.changes };
	} catch (error) {
		logEvents(`Database error updating refresh tokens for user with ID "${userId}", do they not exist?: ${error.message}`, 'errLog.txt', { print: true });
		return { success: false, message: `Error: ${error.message}` };
	}
}



/**
 * Retrieves the user ID and username from a refresh token.
 * This does NOT test it we have manually invalidated it if they logged out early!!
 * @param {string} refreshToken - The refresh token to decode.
 * @returns {object} - An object: { user_id, username } if valid, or {} if the token is invalid.
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
	return db.get(query, [userId]);
}




/**
 * Returns the `verified` property of the member.
 * @param {string} username - Their username, in lowercase
 * @returns {boolean|0} - The verified property, if it exists, otherwise 0 (already verified, or member doesn't exist).
 */
const getVerified = (username) => {
	if (!doesMemberExist(username)) {
		const errText = `Cannot get the verified property of non-existent member "${username}"!`;
		logEvents(errText, "errLog.txt", { print: true });
		return 0;
	}
	const verified = members[username].verified;
	if (verified) return verified[0];
	return 0;
};

/**
 * Tests if the provided account verification ID matches their data.
 * Called when a new user clicks verify account in their verification email.
 * @param {string} username - Their username, in lowercase
 * @param {string} verificationID - The verification ID from their verification link.
 * @returns {boolean} true if the provided verification ID matches their data.
 */
const doesVerificationIDMatch = (username, verificationID) => {
	if (!doesMemberExist(username)) {
		const errText = `Cannot verify verification ID of non-existent member "${username}"!`;
		logEvents(errText, "errLog.txt", { print: true });
		return false;
	}
	return members[username].verified[1] === verificationID;
};

/**
 * Sets the `verified` property of the member data.
 * @param {string} username - Their username, in lowercase
 * @param {true|0} value - The new value of the `verified` property, either true or 0, 0 meaning they are verified and we have told them they are.
 * @returns {boolean} true if it was a success
 */
const setVerified = (username, value) => {
	if (!doesMemberExist(username)) {
		const errText = `Cannot set verification property of non-existent member "${username}"!`;
		logEvents(errText, "errLog.txt", { print: true });
		return false;
	}
	if (value !== true && value !== 0) {
		const errText = `Cannot set member ${getUsernameCaseSensitive(username)}'s verified parameter to any value besides true or 0! Received value: ${value}`;
		logEvents(errText, "errLog.txt", { print: true });
		return false;
	}
	members[username].verified[0] = value;
	if (value === 0) delete members[username].verified; // Already verified (and they have seen that fact)
	membersHasBeenEdited = true; // Flag it to be saved
	return true; // Success
};

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
	getVerified,
	doesVerificationIDMatch,
	removeExpiredTokens,
	addRefreshToken,
	deleteRefreshToken,
	setVerified,
	getInfo,
	updateLastSeen,
	getUserIDAndUsernameFromRefreshToken,
	getUserUsernameEmailAndVerification,
};
