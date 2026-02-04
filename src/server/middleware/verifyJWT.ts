// src/server/middleware/verifyJWT.ts

/*
 * This module reads incoming requests, searching for a
 * valid authorization header, or a valid refresh token cookie,
 * to verify their identity, and sets the `user` and `role`
 * properties of the request (or of the websocket metadata)
 * if they are logged in.
 */

import type { Request, Response, NextFunction } from 'express';

import { getClientIP } from '../utility/IP.js';
import { CustomWebSocket } from '../socket/socketUtility.js';
import { logEventsAndPrint } from './logEvents.js';
import { IdentifiedRequest, isRequestIdentified, ParsedCookies } from '../types.js';
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
 * private information to unauthorized users.\
 */
function verifyJWT(req: Request, res: Response, next: NextFunction): void {
	const cookies: ParsedCookies = req.cookies;
	req.memberInfo = { signedIn: false, browser_id: cookies['browser-id'] };

	// After this line, typescript then thinks the req is of the IdentifiedRequest type.
	if (!isRequestIdentified(req))
		throw Error('Not all required IdentifiedRequest properties were set!');

	const hasAccessToken = verifyAccessToken(req, res);
	if (!hasAccessToken) verifyRefreshToken(req, res);

	next(); // Continue down the middleware waterfall
}

/**
 * [HTTP] Reads the request's bearer token (from the authorization header),
 * sets the connections `memberInfo` property if it is valid (are signed in).
 *
 * Returns whether they have a valid access token or not.
 */
function verifyAccessToken(req: IdentifiedRequest, res: Response): boolean {
	const authHeader = req.headers.authorization;
	if (!authHeader) return false; // No authentication header included
	if (!authHeader.startsWith('Bearer ')) return false; // Authentication header doesn't look correct

	const accessToken = authHeader.split(' ')[1];
	if (!accessToken) return false; // Authentication header doesn't contain a token

	const result = isAccessTokenValid(accessToken);
	if (!result.isValid) {
		logEventsAndPrint(
			`Invalid access token, expired or tampered! "${accessToken}"`,
			'errLog.txt',
		);
		// Revoke their session now, in case they were manually logged out, and their client didn't know that.
		// The client should never use an expired token unless it's a bug.
		revokeSession(res);
		return false;
	}

	// Token is valid and hasn't hit the 15m expiry

	console.log('A valid access token was used! :D :D');

	req.memberInfo = { ...req.memberInfo, signedIn: true, ...result.payload }; // Username was our payload when we generated the access token
	return true;
}

/**
 * [HTTP] Reads the request's refresh token cookie,
 * updates the connections `memberInfo` property if it is valid (are signed in).
 * Only call if they did not have a valid access token, as this performs database queries!
 */
function verifyRefreshToken(req: IdentifiedRequest, res: Response): void {
	const cookies: ParsedCookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return; // No refresh token present

	const result = isRefreshTokenValid(refreshToken, getClientIP(req));

	if (!result.isValid) {
		// Token was expired or tampered, or manually invalidated.
		console.log(
			`Invalid refresh token: Expired, tampered, or account deleted! Reason: "${result.reason}"`,
		);
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
		logEventsAndPrint(`Error freshening session: ${errMsg}`, 'errLog.txt');
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
function verifyJWTWebSocket(ws: CustomWebSocket): void {
	verifyRefreshToken_WebSocket(ws);
}

/**
 * [WebSocket] If they have a valid refresh token cookie (http-only), set's
 * the socket metadata's `user` property, ands returns true.
 * @param ws - The websocket object
 * @returns true if a valid token was found.
 */
function verifyRefreshToken_WebSocket(ws: CustomWebSocket): void {
	const cookies = ws.metadata.cookies;

	const refreshToken = cookies.jwt;
	if (!refreshToken) return; // Not logged in, don't set their user property

	// { isValid (boolean), user_id, username, reason (string, if not valid) }
	const ip = ws.metadata.IP;
	const result = isRefreshTokenValid(refreshToken, ip); // True for refresh token
	if (!result.isValid) {
		console.log(
			`Invalid refresh token (websocket): Expired, tampered, or account deleted! Reason: "${result.reason}". Token: "${refreshToken}"`,
		);
		return; // Token was expired or tampered
	}

	ws.metadata.memberInfo = { ...ws.metadata.memberInfo, signedIn: true, ...result.payload };
}

export { verifyJWT, verifyJWTWebSocket };
