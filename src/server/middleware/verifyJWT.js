
/*
 * This module reads incoming requests, searching for a
 * valid authorization header, or a valid refresh token cookie,
 * to verify their identity, and sets the `user` and `role`
 * properties of the request (or of the websocket metadata)
 * if they are logged in.
 */

import jwt from 'jsonwebtoken';
import { setRole, setRoleWebSocket } from '../database/controllers/roles.js';
import { doesMemberHaveToken, isTokenValid } from '../database/controllers/tokenController.js';
import { doesMemberOfIDExist } from '../database/controllers/memberController.js';
import { logEvents } from './logEvents.js';

/** @typedef {import('../game/TypeDefinitions.js').Socket} Socket */


/**
 * Reads the request's bearer token (from the authorization header)
 * OR the refresh cookie (contains refresh token),
 * sets the connections `user` and `role` properties if it is valid (are signed in).
 * Further middleware can read these properties to not send
 * private information to unauthorized users.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
const verifyJWT = (req, res, next) => {
	req.memberInfo = { signedIn: false };

	const hasAccessToken = verifyAccessToken(req);
	if (!hasAccessToken) verifyRefreshToken(req);

	setRole(req);

	// Here we can update their last-seen variable!
	// ...

	next(); // Continue down the middleware waterfall
};

/**
 * Reads the request's bearer token (from the authorization header),
 * sets the connections `memberInfo` property if it is valid (are signed in).
 * @param {Object} req - The request object
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyAccessToken(req) {
	const authHeader = req.headers.authorization || req.headers.Authorization;
	if (!authHeader) return false; // No authentication header included
	if (!authHeader.startsWith('Bearer ')) return false; // Authentication header doesn't look correct

	const accessToken = authHeader.split(' ')[1];
	if (!accessToken) return false; // Authentication header doesn't contain a token

	// { isValid (boolean), user_id, username, roles }
	const result = isTokenValid(accessToken, false); // False for access token
	if (!result.isValid) {
		logEvents(`Invalid access token, expired or tampered! "${accessToken}"`, 'errLog.txt', { print: true }); // Forbidden, invalid token
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
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyRefreshToken(req) {
	const cookies = req.cookies;
	if (!cookies) return logEvents("Cookie parser didn't set the req.cookies property!", 'errLog.txt', { print: true });

	const refreshToken = cookies.jwt;
	if (!refreshToken) return false; // No refresh token present

	// { isValid (boolean), user_id, username }
	const result = isTokenValid(refreshToken, true); // true for refresh token
	if (!result.isValid) return false;

	// Valid! Set their req.memberInfo property!

	const { user_id, username, roles } = result;
	req.memberInfo = { signedIn: true, user_id, username, roles }; // Username was our payload when we generated the access token

	return true; // true if they have a valid REFRESH token
};



// Checks bearer token, sets req.memberInfo to any matching user.

/**
 * Reads the access token cookie OR the refresh cookie token,
 * sets the socket metadata's `user` and `role`
 * properties if it is valid (are signed in).
 * The invite and game managers can use these
 * properties to verify their identity.
 * @param {Socket} ws - The websocket object
 * @param {Object} cookies - An object containing the pre-read cookies of the websocket connection request. These should be `token`, `jwt` (refresh token), and `browser-id`.
 */
const verifyJWTWebSocket = (ws, cookies) => {
	const hasToken = verifyAccessTokenWebSocket(ws, cookies);
	if (!hasToken) verifyRefreshTokenWebSocket(ws, cookies);

	setRoleWebSocket(ws);

	// Here I can update their last-seen variable!
	// ...
};

/**
 * If they have a valid access token cookie, set's the socket
 * metadata's `user` property, ands returns true.
 * @param {Socket} ws - The websocket object
 * @param {Object} cookies - An object containing the pre-read cookies of the websocket connection request. This should contain the `token` cookie.
 * @returns {boolean} true if a valid token was found.
 */
function verifyAccessTokenWebSocket(ws, cookies) {
	const token = cookies.token;
	if (!token) return false; // Token empty

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) return console.log('Invalid access token (ws)!'); // Forbidden, invalid token
		if (!doesMemberOfIDExist(decoded.user_id)) return; // I have deleted their account, so their access token is no longer valid.
		ws.metadata.user = decoded.username; // Username was our payload when we generated the access token
	});

	return ws.metadata.user != null; // true if they have a valid ACCESS token
}

/**
 * If they have a valid refresh token cookie (http-only), set's
 * the socket metadata's `user` property, ands returns true.
 * @param {Socket} ws - The websocket object
 * @param {Object} cookies - An object containing the pre-read cookies of the websocket connection request. This should contain the `jwt` (refresh token) cookie.
 * @returns {boolean} true if a valid token was found.
 */
function verifyRefreshTokenWebSocket(ws, cookies) {
	const refreshToken = cookies.jwt;
	if (!refreshToken) return false; // Not logged in, don't set their user property

	// First make sure we haven't manually invalidated this refresh token if they've logged out.
	const memberWithThisRefreshToken = findMemberFromRefreshToken(refreshToken);
	if (!memberWithThisRefreshToken) return false; // They've logged out since.

	jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
		if (err || memberWithThisRefreshToken !== decoded.username) return console.log('Invalid refresh token! Expired or tampered. verifyJWTWebSocket middleware.'); // Refresh token expired or tampered
		ws.metadata.user = decoded.username;
	});

	return ws.metadata.user != null; // true if they have a valid REFRESH token
}



export {
	verifyJWT,
	verifyJWTWebSocket
};