import { deletePreferencesCookie } from "../../api/Prefs.js";
import { logEvents } from "../../middleware/logEvents.js";
import { addRefreshTokenToMemberData, deleteRefreshTokenFromMemberData, deleteRefreshTokensOfUser, getRefreshTokensByUserID, saveRefreshTokens } from "../../database/refreshTokenManager.js";
import { addTokenToRefreshTokens, deleteRefreshTokenFromTokenList, getTimeMillisSinceIssued, removeExpiredTokens } from "./refreshTokenObject.js";
import { signRefreshToken } from "./tokenSigner.js";
import { minTimeToWaitToRenewRefreshTokensMillis, refreshTokenExpiryMillis } from "../../config/config.js";


// Renewing & Revoking Sessions --------------------------------------------------------------------


/**
 * Checks if a member has a specific refresh token.
 * If they do, and it wasn't recently issued, we automatically
 * refresh it by giving them a new refresh cookie!
 * @param {number} userId - The user ID of the member whose refresh tokens are to be checked.
 * @param {number} username
 * @param {number} roles
 * @param {string} token - The refresh token to check.
 * @param {string} IP - The IP address they are connecting from.
 * @param {number} req - The request object. 
 * @param {number} res - The response object. If provided, we will renew their refresh token cookie if it's been a bit.
 * @returns {boolean} - Returns true if the member has the refresh token, false otherwise.
 */
function doesMemberHaveRefreshToken_RenewSession(userId, username, roles, token, IP, req, res) {
	// Get the valid refresh tokens for the user
	const refreshTokens = getRefreshTokensByUserID(userId);
	if (refreshTokens === undefined) {
		logEvents(`Cannot test if non-existent member of id "${userId}" has refresh token "${token}"!`, 'errLog.txt', { print: true });
		return false;
	}

	let changesMade = false;

	// Remove expired tokens
	const validRefreshTokens = removeExpiredTokens(refreshTokens);
	if (validRefreshTokens.length !== refreshTokens.length) changesMade = true; // At least one token was deleted by expired, save the list.

	// Find the object where tokenObj.token matches the provided token
	const matchingTokenObj = validRefreshTokens.find(tokenObj => tokenObj.token === token); // { token, issued, expires, IP (not always present) }
	if (!matchingTokenObj) {
		if (changesMade) saveRefreshTokens(userId, validRefreshTokens);
		return false;
	}

	// Does the request IP address match the IP address when the session token was originally issued?
	// If not, update their most recent IP where the token was used.
	if (IP !== matchingTokenObj.IP) {
		matchingTokenObj.IP = IP;
		changesMade = true;
	}

	// We have the token...
	
	// When does it expire? Should we renew?
	const didSaveTokens = renewSession(req, res, userId, username, roles, validRefreshTokens, matchingTokenObj);
	if (!didSaveTokens && changesMade) saveRefreshTokens(userId, validRefreshTokens); // Save it now since the renew session function didn't

	return true;
}

/**
 * Renews a player's login session
 * @param {*} req
 * @param {*} res 
 * @param {*} userId 
 * @param {*} username 
 * @param {*} roles 
 * @param {*} refreshTokens - The parsed refresh tokens from their data in the members table
 * @param {*} tokenObject - The token that needs to be renewed (deleted + add new) if we are renewing!
 * @returns {boolean} true if the session was renewed (the refresh tokens will have been saved in the database)
 */
function renewSession(req, res, userId, username, roles, refreshTokens, tokenObject) {
	if (!req || !res) return; // Only renew if the response object is defined, the response object will not be defined for websocket upgrade requests.
	
	const timeSinceIssued = getTimeMillisSinceIssued(tokenObject);
	if (timeSinceIssued < minTimeToWaitToRenewRefreshTokensMillis) return false;

	console.log(`Renewing member "${username}"s session by issuing them new login cookies! -------`);

	refreshTokens = deleteRefreshTokenFromTokenList(refreshTokens, tokenObject.token);

	// The payload can be an object with their username and their roles.
	const newToken = signRefreshToken(userId, username, roles);

	// Add the new token to the list
	addTokenToRefreshTokens(req, refreshTokens, newToken);

	saveRefreshTokens(userId, refreshTokens);

	createSessionCookies(res, userId, username, newToken);

	return true;
}

function createNewSession(req, res, user_id, username, roles) {
	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles);
    
	// Save the refresh token with current user so later when they log out we can invalidate it.
	addRefreshTokenToMemberData(req, user_id, refreshToken);
    
	createSessionCookies(res, user_id, username, refreshToken);
}

function revokeSession(res, userId, deleteToken) {
	// Only delete the token from member data if it's specified (may be websocket related or an account deletion)
	// Sometimes we may want to skip this, in the event their account is being deleted right after anyway,
	// in that case all refresh_tokens are being deleted so this line doesn't matter.
	// Or if we know the token isn't present anyway.
	if (deleteToken !== undefined) deleteRefreshTokenFromMemberData(userId, deleteToken);
	if (!res) return; // Websocket-related, or deleted account automatically
	deleteSessionCookies(res);
	deletePreferencesCookie(res); // Even though this cookie only lasts 10 seconds, it's good to delete it here.
}


// Cookies storing session information --------------------------------------------------------------------


/**
 * Creates and sets the cookies:
 * * memberInfo containing user info (user ID and username),
 * * jwt containing our refresh token.
 * @param {Object} res - The response object.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @param {string} refreshToken - The refresh token to be stored in the cookie.
 */
function createSessionCookies(res, userId, username, refreshToken) {
	createRefreshTokenCookie(res, refreshToken);
	createMemberInfoCookie(res, userId, username);
}

/**
 * Deletes the cookies that store session information
 * @param {Object} res - The response object.
 */
function deleteSessionCookies(res) {
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
	const now = Date.now();
	const issued = now; // Timestamp, millis since Unix Epoch
	const expires = now + refreshTokenExpiryMillis; // Timestamp, millis since Unix Epoch
	const memberInfo = JSON.stringify({ user_id: userId, username, issued, expires });

	// Set the cookie (readable by JavaScript, not HTTP-only)
	// Cross-site usage requires we set sameSite to 'None'! Also requires secure (https) true
	res.cookie('memberInfo', memberInfo, { httpOnly: false, sameSite: 'None', secure: true, maxAge: refreshTokenExpiryMillis });
}

/**
 * Deletes the HTTP-only refresh token cookie.
 * @param {Object} res - The response object.
 */
function deleteMemberInfoCookie(res) {
	// Clear the 'jwt' cookie by setting the same options as when it was created
	res.clearCookie('memberInfo', { httpOnly: false, sameSite: 'None', secure: true });
}

/**
 * Revokes all login sessions of a user by user_id.
 * It does this by deleting their refresh_tokens cell, invalidating all of them.
 * 
 * IF YOU ARE DELETING THEIR ACCOUNT: You don't have to do this step.
 * 
 * Since it doesn't have access to the response object,
 * the user affected will have to refresh the page for
 * their navigation links to change.
 * @param {number} user_id 
 */
function deleteAllSessionsOfUser(user_id) {
	deleteRefreshTokensOfUser(user_id);
}



export {
	createNewSession,
	doesMemberHaveRefreshToken_RenewSession,
	revokeSession,
	deleteAllSessionsOfUser,
};