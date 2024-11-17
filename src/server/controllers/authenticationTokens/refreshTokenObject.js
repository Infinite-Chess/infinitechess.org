
import { refreshTokenExpiryMillis } from "../../config/config.js";
import { logEvents } from "../../middleware/logEvents.js";

/**
 * The script works with modifying refresh token objects stored in the database.
 * [ { token, issued, expires }, { token, issued, expires }, ...]
 * 
 * Very few dependancies.
 */



/**
 * Deletes a specific refresh token in the database for a user based on their user_id.
 * @param {number} userId - The user ID of the member whose refresh token is to be deleted.
 * @param {string} token - The refresh token to be deleted from the user's refresh_tokens column.
 * @returns {Object[]}
 */
function deleteRefreshTokenFromTokenList(refreshTokens, deleteToken) {
	if (!refreshTokens) {
		logEvents("Cannot delete token from refresh token list when the refresh token list is not provided!", 'errLog.txt', { print: true });
		return refreshTokens;
	}
	if (!deleteToken) {
		logEvents("Cannot delete token from refresh token list when the token to delete is not provided!", 'errLog.txt', { print: true });
		return refreshTokens;
	}

	// Remove the specified refresh token from the array
	return refreshTokens.filter(token => token.token !== deleteToken);
}

/**
 * Adds a new refresh token to a parsed array of existing refresh tokens.
 * @param {Object[]} refreshTokens - The array of existing refresh tokens.
 * @param {string} token - The new refresh token to add.
 * @returns {Object[]} - The updated array of refresh tokens.
 */
function addTokenToRefreshTokens(refreshTokens, token) {
	// Create the new refresh token object
	const now = Date.now();
	const newRefreshToken = {
		token,
		issued: now,
		expires: now + refreshTokenExpiryMillis, // Expiry in milliseconds
	};
	
	// Add the new token to the array
	refreshTokens.push(newRefreshToken);
	
	// Return the updated array
	return refreshTokens;
}

/**
 * Removes expired refresh tokens from the array of existing refresh tokens.
 * @param {Object[]} tokens - The array of existing refresh tokens: [ { token, expires }, { token, expires }, ...]
 * @returns {Object[]} - The updated array with expired tokens removed.
 */
function removeExpiredTokens(tokens) {
	const currentTime = Date.now();
	// Filter out tokens that have expired
	return tokens.filter(tokenObj => tokenObj.expires > currentTime);
}



export {
	deleteRefreshTokenFromTokenList,
	addTokenToRefreshTokens,
	removeExpiredTokens,
};