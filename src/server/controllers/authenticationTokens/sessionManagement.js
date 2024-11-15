import { deletePreferencesCookie } from "../../api/Prefs.js";
import { refreshTokenExpiryMillis, signRefreshToken, timeToWaitToRenewRefreshTokensMillis } from "../../database/controllers/tokenController.js";
import { logEvents } from "../../middleware/logEvents.js";
import { addRefreshTokenToMemberData, deleteRefreshTokenFromMemberData, getRefreshTokensByUserID, saveRefreshTokens } from "./refreshTokenManager.js";
import { addTokenToRefreshTokens, deleteRefreshTokenFromTokenList, removeExpiredTokens } from "./refreshTokenObject.js";




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
	deletePreferencesCookie(res); // Even though this cookie only lasts 10 seconds, it's good to delete it here.
}


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

function issueNewRefreshToken(res, user_id, username, roles) {
	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles);
    
	// Save the refresh token with current user so later when they log out we can invalidate it.
	addRefreshTokenToMemberData(user_id, refreshToken); // false for access token
    
	createLoginCookies(res, user_id, username, refreshToken);
}

export {
	revokeSession,
	doesMemberHaveRefreshToken_RenewSession,
	issueNewRefreshToken,
};