
import jwt from 'jsonwebtoken';
import { getTranslationForReq } from '../../utility/translate';
import { getMemberDataByCriteria, updateLastSeen, updateMemberColumns } from './members';
import { logEvents } from '../../middleware/logEvents';
import { refreshTokenExpiryMillis, signAccessToken } from './tokenController';
import { createAccessTokenCookie } from './accessTokenController';
import { assignOrRenewBrowserID } from './browserIDController';

// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!

/**
 * Called when the browser fetches /refresh. This reads any refresh token cookie present,
 * and gives them a new access token if they are signed in.
 * If they are not, it gives them a browser-id cookie to verify their identity.
 * @param {*} req 
 * @param {*} res 
 * @returns 
 */
const handleRefreshToken = (req, res) => {
	const cookies = req.cookies;
	// If we have cookies AND there's a jwt property..
	if (!cookies?.jwt) {
		assignOrRenewBrowserID(req, res);
		return res.status(401).json({'message' : getTranslationForReq("server.javascript.ws-refresh_token_expired", req) });
	}
	const refreshToken = cookies.jwt;

	const { user_id, username } = getUserIDAndUsernameFromRefreshToken(refreshToken);
	if (user_id === undefined) {
		assignOrRenewBrowserID(req, res);
		return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_invalid", req) }); // Expired or Tampered token, it didn't decode to anybody's username.
	}

	// Token is valid and hasn't hit the 5-day expiry, but have we manually invalidated it by logging out?
	// If we have removed the refresh token from the members data in the database. That means they have logged out.
	// ...
	
	if (!doesMemberHaveRefreshToken(user_id, refreshToken)) {
		assignOrRenewBrowserID(req, res);
		return res.status(403).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found_logged_out", req) }); // Forbidden
	}

	// Token is valid! Send them new access token!

	const accessToken = signAccessToken(user_id, username);

	// SEND the token as a cookie!
	createAccessTokenCookie(res, accessToken);
	res.json({ member: username });
	console.log(`Refreshed access token for member "${username}" --------`);

	// Update their last-seen variable
	updateLastSeen(user_id);
};

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
 * Extracts and decodes the payload from a refresh token.
 * @param {string} refreshToken - The refresh token to decode.
 * @returns {object|undefined} - The decoded payload if valid: { username }, or undefined if the token is invalid.
 */
function getRefreshTokenPayload(refreshToken) {
	try {
		// Decode the JWT and return the payload
		return jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
	} catch (err) {
		// Log the error event when verification fails
		logEvents(`Failed to verify refresh token: ${err.message}`, 'errLog.txt', { print: true });
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}

/**
 * Creates and sets an HTTP-only cookie containing the refresh token.
 * @param {Object} res - The response object.
 * @param {string} refreshToken - The refresh token to be stored in the cookie.
 */
function createRefreshTokenCookie(res, refreshToken) {
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true
	res.cookie('jwt', refreshToken, { httpOnly: true, sameSite: 'None', secure: true, maxAge: refreshTokenExpiryMillis });
}



// Interactions with the "refresh_tokens" column in the members table ----------------------------------------------------------------



/**
 * Checks if a member has a specific refresh token.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be checked.
 * @param {string} refreshToken - The refresh token to check.
 * @returns {boolean} - Returns true if the member has the refresh token, false otherwise.
 */
function doesMemberHaveRefreshToken(userId, refreshToken) {
	// Get the valid refresh tokens for the user
	const refreshTokens = getRefreshTokensByUserID_DeleteExpired(userId);
	if (refreshTokens === undefined) {
		logEvents(`Cannot test if non-existent member of id "${userId}" has refresh token "${refreshToken}"!`, 'errLog.txt', { print: true });
		return false;
	}

	// Check if any of the valid tokens match the provided refresh token
	return refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
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
	if (refresh_tokens === undefined) return logEvents(`Cannot get refresh tokens of a non-existent member of id "${userId}"!`, 'errLog.txt', { print: true });
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
	if (refreshTokens === undefined) return logEvents(`Cannot get refresh tokens (and delete expired) of a non-existent member of id "${userId}"!`, 'errLog.txt', { print: true });

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
function addRefreshTokenToMemberData(userId, newToken) {
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
	else logEvents(`Unable to find refresh token to delete of member with id "${userId}"!`, 'errLog.txt', { print: true });
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
	if (!updateResult) logEvents(`No changes made when saving refresh_tokens of member with id "${userId}"!`, 'errLog.txt', { print: true });
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
		expires: Date.now() + refreshTokenExpiryMillis // Expiry in milliseconds
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



export {
	handleRefreshToken,
	addRefreshTokenToMemberData,
	deleteRefreshToken,
	createRefreshTokenCookie,
};