
import { getMemberDataByCriteria, updateMemberColumns } from './memberController.js';
import { refreshTokenExpiryMillis, signRefreshToken, timeToWaitToRenewRefreshTokensMillis } from './tokenController.js';
import { logEvents } from '../../middleware/logEvents.js';




function issueNewRefreshToken(res, user_id, username, roles) {
	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles);
    
	// Save the refresh token with current user so later when they log out we can invalidate it.
	addRefreshTokenToMemberData(user_id, refreshToken); // false for access token
    
	createLoginCookies(res, user_id, username, refreshToken);
}



/**
 * Creates and sets the cookies:
 * * memberInfo containing user info (user ID and username),
 * * jwt containing our refresh token.
 * @param {Object} res - The response object.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @param {string} refreshToken - The refresh token to be stored in the cookie.
 */
function createLoginCookies(res, userId, username, refreshToken) {
	createRefreshTokenCookie(res, refreshToken);
	createMemberInfoCookie(res, userId, username);
}

/**
 * Creates and sets the cookies:
 * * memberInfo containing user info (user ID and username),
 * * jwt containing our refresh token.
 * @param {Object} res - The response object.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @param {string} refreshToken - The refresh token to be stored in the cookie.
 */
function deleteLoginCookies(res) {
	if (!res) return; // Websocket-related
	deleteRefreshTokenCookie(res);
	deleteMemberInfoCookie(res);
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

/**
 * Deletes the HTTP-only refresh token cookie.
 * @param {Object} res - The response object.
 */
function deleteRefreshTokenCookie(res) {
	// Clear the 'jwt' cookie by setting the same options as when it was created
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });
}

/**
 * Creates and sets a cookie containing user info (user ID and username),
 * accessible by JavaScript, with the same expiration as the refresh token.
 * @param {Object} res - The response object.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 */
function createMemberInfoCookie(res, userId, username) {
	// Create an object with member info
	const memberInfo = JSON.stringify({ user_id: userId, username });

	// Set the cookie (readable by JavaScript, not HTTP-only)
	// Cross-site usage requires we set sameSite to 'None'! Also requires secure (https) true
	res.cookie('memberInfo', memberInfo, {
		httpOnly: false, // Accessible by JavaScript
		sameSite: 'None', // Cross-site cookies
		secure: true,     // Requires HTTPS
		maxAge: refreshTokenExpiryMillis // Match the refresh token cookie expiration
	});
}

/**
 * Deletes the HTTP-only refresh token cookie.
 * @param {Object} res - The response object.
 */
function deleteMemberInfoCookie(res) {
	// Clear the 'jwt' cookie by setting the same options as when it was created
	res.clearCookie('memberInfo', { httpOnly: false, sameSite: 'None', secure: true });
}

function revokeSession(res, userId, deleteToken) {
	// Only delete the token from member data if it's specified (may be websocket related or an account deletion)
	if (deleteToken !== undefined) deleteRefreshTokenFromMemberData(userId, deleteToken);
	deleteLoginCookies(res);
}




// Interactions with the "refresh_tokens" column in the members table ----------------------------------------------------------------



/**
 * Checks if a member has a specific refresh token.
 * If they do, and it wasn't recently issued, we automatically
 * refresh it by giving them a new refresh cookie!
 * @param {number} userId - The user ID of the member whose refresh tokens are to be checked.
 * @param {number} username
 * @param {number} roles
 * @param {string} token - The refresh token to check.
 * @param {number} [res] - The response object. If provided, we will renew their refresh token cookie if it's been a bit.
 * @returns {boolean} - Returns true if the member has the refresh token, false otherwise.
 */
function doesMemberHaveRefreshToken_RenewSession(userId, username, roles, token, res) {
	// Get the valid refresh tokens for the user
	let refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) {
		logEvents(`Cannot test if non-existent member of id "${userId}" has refresh token "${token}"!`, 'errLog.txt', { print: true });
		return false;
	}

	// Remove expired tokens
	refreshTokens = removeExpiredTokens(refreshTokens);

	// Find the object where tokenObj.token matches the provided token
	const matchingTokenObj = refreshTokens.find(tokenObj => tokenObj.token === token); // { token, issued, expires }
	if (!matchingTokenObj) return false;

	// We have the token...
	
	// When does it expire? Should we renew?
	renewSession(res, userId, username, roles, refreshTokens, matchingTokenObj);

	return true;
}

/**
 * Renews a player's logging session
 * @param {*} res 
 * @param {*} userId 
 * @param {*} username 
 * @param {*} roles 
 * @param {*} refreshTokens - The parsed refresh tokens from their data in the members table
 * @param {*} tokenObject - The token that needs to be renewed (deleted + add new) if we are renewing!
 */
function renewSession(res, userId, username, roles, refreshTokens, tokenObject) {
	if (!res) return; // Only renew if the response object is defined, the response object will not be defined for websocket upgrade requests.
	
	const now = Date.now();
	const timeSinceIssued = now - tokenObject.issued;
	if (timeSinceIssued < timeToWaitToRenewRefreshTokensMillis) return;

	console.log(`Renewing member "${username}"s session by issuing them new login cookies! -------`);

	refreshTokens = deleteRefreshTokenFromTokenList(refreshTokens, tokenObject.token);

	// The payload can be an object with their username and their roles.
	const newToken = signRefreshToken(userId, username, roles);

	// Add the new token to the list
	refreshTokens = addTokenToRefreshTokens(refreshTokens, newToken);

	saveRefreshTokens(userId, refreshTokens);

	createLoginCookies(res, userId, username, newToken);
}

/**
 * Fetches the refresh tokens for a given user ID.
 * @param {number} userId - The user ID of the member whose refresh tokens are to be fetched.
 * @returns {object[]|undefined} - An array of all their refresh tokens: [ { token, expires }, { token, expires }, ...], or undefined if the member doesn't exist
 */
function getRefreshTokensByUserID(userId) {
	let { refresh_tokens } = getMemberDataByCriteria(['refresh_tokens'], 'user_id', userId);

	// If the user doesn't exist (row is undefined), return undefined.
	if (refresh_tokens === undefined) {
		logEvents(`Cannot get refresh tokens of a non-existent member of id "${userId}"!`, 'errLog.txt', { print: true });
		return;
	}

	// If the user exists but has null or no refresh tokens, return an empty array.
	if (refresh_tokens === null) refresh_tokens = '[]';

	return JSON.parse(refresh_tokens);
}

/**
 * Adds a new refresh token in the database to the refresh_tokens column for a member.
 * @param {number} userId - The user ID of the member.
 * @param {string} token - The new refresh token to add.
 */
function addRefreshTokenToMemberData(userId, token) {
	// Get the current refresh tokens
	let refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot add refresh token to non-existent member with id "${userId}"!`, 'errLog.txt', { print: true });

	// Remove any expired tokens
	refreshTokens = removeExpiredTokens(refreshTokens);

	// Add the new token to the list
	refreshTokens = addTokenToRefreshTokens(refreshTokens, token);

	// Save the tokens in the database
	saveRefreshTokens(userId, refreshTokens);
}


/**
 * Deletes a specific refresh token in the database for a user based on their user_id.
 * @param {number} userId - The user ID of the member whose refresh token is to be deleted.
 * @param {string} token - The refresh token to be deleted from the user's refresh_tokens column.
 */
function deleteRefreshTokenFromMemberData(userId, deleteToken) {
	// Fetch the current refresh tokens for the user
	const refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) return logEvents(`Cannot delete refresh token from non-existent member with id "${userId}"!`, 'errLog.txt', { print: true });

	// Remove any expired tokens. Do this whenever we read and write it.
	let newRefreshTokens = removeExpiredTokens(refreshTokens);

	// Remove the specified refresh token from the array
	newRefreshTokens = deleteRefreshTokenFromTokenList(newRefreshTokens, deleteToken);

	// Save the updated refresh tokens
	if (newRefreshTokens.length !== refreshTokens.length) saveRefreshTokens(userId, newRefreshTokens);
	else logEvents(`Unable to find refresh token to delete of member with id "${userId}"!`, 'errLog.txt', { print: true });
}

/**
 * Deletes a specific refresh token in the database for a user based on their user_id.
 * @param {number} userId - The user ID of the member whose refresh token is to be deleted.
 * @param {string} token - The refresh token to be deleted from the user's refresh_tokens column.
 */
function deleteRefreshTokenFromTokenList(refreshTokens, deleteToken) {
	// Remove the specified refresh token from the array
	return refreshTokens.filter(token => token.token !== deleteToken);
}

/**
 * Updates the refresh tokens for a given user.
 * @param {number} userId - The user ID of the member.
 * @param {object[]} tokens - The new array of refresh tokens to save.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token (false if access token).
 */
function saveRefreshTokens(userId, tokens) {
	// If the tokens array is empty, set it to null
	if (tokens.length === 0) tokens = null;

	// Update the refresh_tokens or access_tokens column
	const updateResult = updateMemberColumns(userId, { refresh_tokens: tokens });  // Corrected: Use [column] to dynamically set the key

	// If no changes were made, log the event
	if (!updateResult) logEvents(`No changes made when saving refresh_tokens of member with id "${userId}"!`, 'errLog.txt', { print: true });
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
		expires: now + refreshTokenExpiryMillis // Expiry in milliseconds
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
	issueNewRefreshToken,
	doesMemberHaveRefreshToken_RenewSession,
	revokeSession,
};