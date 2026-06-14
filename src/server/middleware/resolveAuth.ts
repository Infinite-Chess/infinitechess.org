// src/server/middleware/resolveAuth.ts

/*
 * This module reads incoming requests, searching for a
 * valid authorization header, or a valid refresh token cookie,
 * to verify their identity, and sets the `user` and `role`
 * properties of the request (or of the websocket metadata)
 * if they are logged in.
 */

import type { Request, Response, NextFunction } from 'express';

import { getClientIP } from '../utility/IP.js';
import { ParsedCookies } from '../types.js';
import { CustomWebSocket } from '../socket/socketUtility.js';
import { logEventsAndPrint } from './logEvents.js';
import {
	freshenSession,
	revokeSession,
} from '../controllers/authenticationTokens/sessionManager.js';
import {
	isAccessTokenValid,
	isRefreshTokenValid,
} from '../controllers/authenticationTokens/tokenValidator.js';

/**
 * [HTTP] Reads the request's bearer token (from the authorization header)
 * OR the refresh cookie (contains refresh token),
 * sets req.memberInfo properties if it is valid (are signed in).
 * Further middleware can read these properties to not send
 * private information to unauthorized users.
 * It also triggers session renewal to keep active users' sessions alive.
 *
 * Does DB work. Only use on routes that need authentication.
 */
function resolveAuth(req: Request, res: Response, next: NextFunction): void {
	// Idempotent: skip if auth was already resolved for this request
	if (req.memberInfo !== undefined) return next();

	const cookies: ParsedCookies = req.cookies;
	req.memberInfo = { signedIn: false, browser_id: cookies['browser-id'] };

	const hasAccessToken = tryAccessToken(req, res);
	if (!hasAccessToken) tryRefreshToken(req, res);

	next(); // Continue down the middleware waterfall
}

/**
 * [HTTP] Reads the request's bearer token (from the authorization header),
 * sets the connections `memberInfo` property if it is valid (are signed in).
 *
 * Returns whether they have a valid access token or not.
 */
function tryAccessToken(req: Request, res: Response): boolean {
	const authHeader = req.headers.authorization;
	if (!authHeader) return false; // No authentication header included
	if (!authHeader.startsWith('Bearer ')) return false; // Authentication header doesn't look correct

	const accessToken = authHeader.split(' ')[1];
	if (!accessToken) return false; // Authentication header doesn't contain a token

	const result = isAccessTokenValid(accessToken);
	if (!result) {
		// Revoke their session now, in case they were manually logged out, and their client didn't know that.
		revokeSession(res);
		return false;
	}

	// Token is valid and hasn't hit the 15m expiry

	// console.log('A valid access token was used! :D :D');

	req.memberInfo = { ...req.memberInfo, signedIn: true, ...result.payload }; // Username was our payload when we generated the access token
	return true;
}

/**
 * [HTTP] Reads the request's refresh token cookie,
 * updates the connections `memberInfo` property if it is valid (are signed in).
 * Only call if they did not have a valid access token, as this performs database queries!
 */
function tryRefreshToken(req: Request, res: Response): void {
	const cookies: ParsedCookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return; // No refresh token present

	const result = isRefreshTokenValid(refreshToken, getClientIP(req));

	if (!result) {
		// Revoke their session now, in case they were manually logged out, and their client didn't know that.
		revokeSession(res);
		return;
	}

	const payload = result.payload;

	try {
		// Renew the session if it was issued more than a day ago.
		freshenSession(
			req,
			res,
			payload.user_id,
			payload.username,
			payload.roles,
			result.tokenRecord,
		);
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error freshening session: ${errMsg}`, 'errLog');
	}

	// Valid! Set their req.memberInfo property!

	req.memberInfo = { ...req.memberInfo, signedIn: true, ...result.payload }; // Username was our payload when we generated the access token
}

/**
 * [WebSocket] Reads the refresh cookie token,
 * Modifies ws.metadata.memberInfo if they are signed in
 * to add the user_id, username, and roles properties.
 * @param req
 * @param ws - The websocket object
 */
function resolveAuth_WebSocket(ws: CustomWebSocket): void {
	tryRefreshToken_WebSocket(ws);
}

/**
 * [WebSocket] If they have a valid refresh token cookie (http-only), set's
 * the socket metadata's `user` property, ands returns true.
 * @param ws - The websocket object
 * @returns true if a valid token was found.
 */
function tryRefreshToken_WebSocket(ws: CustomWebSocket): void {
	const refreshToken = ws.metadata.cookies.jwt;
	if (!refreshToken) return; // Not logged in, don't set their user property

	const ip = ws.metadata.IP;
	const result = isRefreshTokenValid(refreshToken, ip); // True for refresh token
	if (!result) return;

	ws.metadata.memberInfo = { ...ws.metadata.memberInfo, signedIn: true, ...result.payload };
}

export { resolveAuth, resolveAuth_WebSocket };
