
import timeutil from "../../../client/scripts/esm/util/timeutil.js";
import { refreshTokenExpiryMillis, sessionCap } from "../../config/config.js";
import { logEvents } from "../../middleware/logEvents.js";
import { getClientIP } from "../../utility/IP.js";

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
 * @param {object} req
 * @param {Object[]} refreshTokens - The array of existing refresh tokens.
 * @param {string} token - The new refresh token to add.
 */
function addTokenToRefreshTokens(req, refreshTokens, token) {
	// Create the new refresh token object
	const now = Date.now();
	const expires = now + refreshTokenExpiryMillis;
	const nowISO = timeutil.timestampToISO(now);
	const expiresISO = timeutil.timestampToISO(expires);
	const newRefreshToken = {
		token,
		issued: nowISO,
		expires: expiresISO,
	};
	if (req !== undefined) newRefreshToken.IP = getClientIP(req);
	
	// Add the new token to the array
	refreshTokens.push(newRefreshToken);
}

/**
 * Removes expired refresh tokens from the array of existing refresh tokens.
 * @param {Object[]} tokens - The array of existing refresh tokens: [ { token, expires }, { token, expires }, ...]
 * @returns {Object[]} - The updated array with expired tokens removed.
 */
function removeExpiredTokens(tokens) {
	const currentTime = Date.now();
	// Filter out tokens that have expired using the isoToTimestamp conversion function
	return tokens.filter(tokenObj => timeutil.isoToTimestamp(tokenObj.expires) > currentTime);
}

/**
 * Returns the time in milliseconds since the token was issued.
 * @param {Object} tokenObj - The refresh token object containing the `issued` property in ISO 8601 format.
 * @returns {number} The time in milliseconds since the token was issued.
 */
function getTimeMillisSinceIssued(tokenObj) {
	// Convert the 'issued' ISO 8601 string to a timestamp
	const issuedTimestamp = timeutil.isoToTimestamp(tokenObj.issued);
	const currentTime = Date.now();
	
	// Return the difference in milliseconds
	return currentTime - issuedTimestamp;
}

/**
 * Removes the oldest refresh tokens until the list size is within sessionCap.
 * Returns an object containing the remaining tokens (trimmedTokens) and the deleted tokens (deletedTokens).
 * @param {Object[]} refreshTokens - The array of refresh tokens: [ { token, issued, expires }, ... ].
 * @returns {Object} - An object with two properties: 
 * - `trimmedTokens`: The updated array with tokens removed to meet the sessionCap.
 * - `deletedTokens`: The array of tokens that were removed.
 */
function trimTokensToSessionCap(refreshTokens) {
	const deletedTokens = []; // Array to store deleted tokens

	// If the token list is within the session cap, no action is needed
	if (refreshTokens.length <= sessionCap) return { trimmedTokens: refreshTokens, deletedTokens };

	// Sort tokens by the issued timestamp (oldest first) in place
	refreshTokens.sort((a, b) => timeutil.isoToTimestamp(a.issued) - timeutil.isoToTimestamp(b.issued));

	// Identify and delete excess tokens (the ones that will be trimmed)
	const excessTokens = refreshTokens.splice(0, refreshTokens.length - sessionCap);
	deletedTokens.push(...excessTokens);

	// Return the object with trimmed and deleted tokens
	return { trimmedTokens: refreshTokens, deletedTokens };
}




export {
	deleteRefreshTokenFromTokenList,
	addTokenToRefreshTokens,
	removeExpiredTokens,
	getTimeMillisSinceIssued,
	trimTokensToSessionCap,
};