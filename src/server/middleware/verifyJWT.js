
/*
 * This module reads incoming requests, searching for a
 * valid authorization header, or a valid refresh token cookie,
 * to verify their identity, and sets the `user` and `role`
 * properties of the request (or of the websocket metadata)
 * if they are logged in.
 */

import jwt from 'jsonwebtoken';
import { setRole } from '../database/controllers/roles.js';
import { doesMemberHaveToken, getUserIDAndUsernameFromToken, isTokenValid } from '../database/controllers/tokenController.js';
import { doesMemberOfIDExist } from '../database/controllers/memberController.js';

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
	const hasAccessToken = verifyAccessToken(req);
	if (!hasAccessToken) verifyRefreshToken(req);

	setRole(req);

	// Here we can update their last-seen variable!
	// ...

	next(); // Continue down the middleware waterfall
};

/**
 * Reads the request's bearer token (from the authorization header),
 * sets the connections `user` property if it is valid (are signed in).
 * @param {Object} req - The request object
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyAccessToken(req) {
	req.user = null;
	const authHeader = req.headers.authorization || req.headers.Authorization;
	if (!authHeader) return false;
	if (!authHeader.startsWith('Bearer ')) return false;

	const accessToken = authHeader.split(' ')[1];
	if (!accessToken) return false; // Token empty

	const { user_id, username } = getUserIDAndUsernameFromToken(accessToken, false); // false for isRefreshToken => isAccessToken
	if (user_id === undefined) {
		console.log('Invalid access token (http)!'); // Forbidden, invalid token
		return false;
	}

	console.log("A valid access token was used! :D");

	if (!doesMemberOfIDExist(user_id)) return false; // They have deleted their account, so their access token is no longer valid.

	// Token is valid and hasn't hit the 15m expiry, but have we manually invalidated it? (perhaps account deleted)
	// If we have removed the refresh token from the members data in the database. That means it is invalid.
	// ...
	
	if (!doesMemberHaveToken(user_id, accessToken, false)) { // false for access token
		return false; // Their access token is no longer valid.
	}

	// Token is valid! Set their req.user property!

	req.user = username; // Username was our payload when we generated the access token

	return user_id !== undefined; // true if they have a valid ACCESS token
}

/**
 * Reads the request's refresh token cookie (http-only),
 * sets the connections `user` property if it is valid (are signed in).
 * Only call if they did not have a valid access token!
 * @param {Object} req - The request object
 * @returns {boolean} true if a valid token was found (logged in)
 */
function verifyRefreshToken(req) {
	const cookies = req.cookies;
	if (!cookies) return console.log('req.cookies was undefined! Is the cookie parser working and before verifyJWT middleware? If they are, it could be that sometimes req.cookies is just undefined.');

	const refreshToken = cookies.jwt;
	if (!refreshToken) return false; // Not logged in, don't set their user property

	// { isValid (boolean), user_id, username }
	const results = isTokenValid(refreshToken, true); // true for isRefreshToken
	if (!results.isValid) return false;

	// Valid! Set their req.user property!

	const { user_id, username } = results;
	req.user = username;

	return true; // true if they have a valid REFRESH token
};



// Checks bearer token, sets req.user to any matching user.

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
		if (!doesMemberExist(decoded.username)) return; // I have deleted their account, so their access token is no longer valid.
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