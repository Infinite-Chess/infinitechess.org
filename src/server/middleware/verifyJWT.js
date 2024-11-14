
/*
 * This module reads incoming requests, searching for a
 * valid authorization header, or a valid refresh token cookie,
 * to verify their identity, and sets the `user` and `role`
 * properties of the request (or of the websocket metadata)
 * if they are logged in.
 */

import { isTokenValid } from '../database/controllers/tokenController.js';
import { logEvents } from './logEvents.js';

/** @typedef {import('../game/TypeDefinitions.js').Socket} Socket */


/**
 * Reads the request's bearer token (from the authorization header)
 * OR the refresh cookie (contains refresh token),
 * sets req.memberInfo properties if it is valid (are signed in).
 * Further middleware can read these properties to not send
 * private information to unauthorized users.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
const verifyJWT = (req, res, next) => {
	req.memberInfo = { signedIn: false };

	const hasAccessToken = verifyAccessToken(req, res);
	if (!hasAccessToken) verifyRefreshToken(req, res);

	next(); // Continue down the middleware waterfall
};

/**
 * Reads the request's bearer token (from the authorization header),
 * sets the connections `memberInfo` property if it is valid (are signed in).
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyAccessToken(req, res) {
	const authHeader = req.headers.authorization || req.headers.Authorization;
	if (!authHeader) return false; // No authentication header included
	if (!authHeader.startsWith('Bearer ')) return false; // Authentication header doesn't look correct

	const accessToken = authHeader.split(' ')[1];
	if (!accessToken) return false; // Authentication header doesn't contain a token

	// { isValid (boolean), user_id, username, roles }
	const result = isTokenValid(accessToken, false, res); // False for access token
	if (!result.isValid) {
		logEvents(`Invalid access token, expired or tampered! "${accessToken}"`, 'errLog.txt', { print: true });
		return false; //Token was expired or tampered
	}

	// Token is valid and hasn't hit the 15m expiry
	// ...

	console.log("A valid access token was used! :D :D");

	const { user_id, username, roles, allowed_actions } = result;
	req.memberInfo = { signedIn: true, user_id, username, roles, allowed_actions }; // Username was our payload when we generated the access token

	return true; // true if they have a valid ACCESS token
}

/**
 * Reads the request's refresh token cookie (http-only),
 * sets the connections `memberInfo` property if it is valid (are signed in).
 * Only call if they did not have a valid access token!
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyRefreshToken(req, res) {
	const cookies = req.cookies;
	if (!cookies) return logEvents("Cookie parser didn't set the req.cookies property!", 'errLog.txt', { print: true });

	const refreshToken = cookies.jwt;
	if (!refreshToken) return false; // No refresh token present

	// { isValid (boolean), user_id, username }
	const result = isTokenValid(refreshToken, true, res); // true for refresh token
	if (!result.isValid) {
		logEvents(`Invalid refresh token, expired or tampered! "${refreshToken}"`, 'errLog.txt', { print: true });
		return false; //Token was expired or tampered
	}

	// Valid! Set their req.memberInfo property!

	const { user_id, username, roles } = result;
	req.memberInfo = { signedIn: true, user_id, username, roles }; // Username was our payload when we generated the access token

	return true; // true if they have a valid REFRESH token
};



/**
 * Reads the access token cookie OR the refresh cookie token,
 * sets the socket metadata's `user` and `role`
 * properties if it is valid (are signed in).
 * The invite and game managers can use these
 * properties to verify their identity.
 * @param {Socket} ws - The websocket object
 * @param {Object} cookies - An object containing the pre-read cookies of the websocket connection request. These should be `token`, `jwt` (refresh token), and `browser-id`.
 */
function verifyJWTWebSocket(ws) {
	ws.metadata.memberInfo = { signedIn: false };
	verifyRefreshToken_WebSocket(ws);
};

/**
 * If they have a valid refresh token cookie (http-only), set's
 * the socket metadata's `user` property, ands returns true.
 * @param {Socket} ws - The websocket object
 * @returns {boolean} true if a valid token was found.
 */
function verifyRefreshToken_WebSocket(ws) {
	const cookies = ws.cookies;
	if (!cookies) return logEvents("Websocket needs to have the cookies property before verifying JWT!", 'errLog.txt', { print: true });

	const refreshToken = cookies.jwt;
	if (!refreshToken) return false; // Not logged in, don't set their user property

	const result = isTokenValid(refreshToken, true); // True for refresh token
	if (!result.isValid) {
		logEvents(`Invalid refresh token (websocket), expired or tampered! "${refreshToken}"`, 'errLog.txt', { print: true }); // Forbidden, invalid token
		return false; //Token was expired or tampered
	}

	const { user_id, username, roles } = result;
	ws.metadata.memberInfo = { signedIn: true, user_id, username, roles }; // Username was our payload when we generated the access token
}

export {
	verifyJWT,
	verifyJWTWebSocket
};