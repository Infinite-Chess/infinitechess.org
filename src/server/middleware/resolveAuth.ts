// src/server/middleware/resolveAuth.ts

/*
 * Reads a request's refresh-token cookie, validates it, and sets `req.memberInfo`
 * (or the websocket metadata's memberInfo) with the signed-in user's identity.
 */

import type { Request, Response, NextFunction } from 'express';

import { getClientIP } from '../utility/IP.js';
import { ParsedCookies } from '../types.js';
import { CustomWebSocket } from '../socket/socketTypes.js';
import { logEventsAndPrint } from '../utility/logEvents.js';
import { validateRefreshToken } from '../controllers/authenticationTokens/tokenValidator.js';
import {
	freshenSession,
	revokeSession,
} from '../controllers/authenticationTokens/sessionManager.js';

/**
 * [HTTP] Resolves identity from the refresh-token cookie, setting `req.memberInfo` so downstream
 * middleware can gate private data. Also renews active sessions. Does DB work — only use on routes
 * that need authentication.
 */
function resolveAuth(req: Request, res: Response, next: NextFunction): void {
	// Idempotent: skip if auth was already resolved for this request
	if (req.memberInfo !== undefined) return next();

	const cookies: ParsedCookies = req.cookies;
	req.memberInfo = { signedIn: false, browser_id: cookies['browser-id'] };

	tryRefreshToken(req, res);

	next();
}

/**
 * [HTTP] Reads the request's refresh token cookie,
 * updates the connections `memberInfo` property if it is valid (are signed in).
 * Performs database queries.
 */
function tryRefreshToken(req: Request, res: Response): void {
	const cookies: ParsedCookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return; // No refresh token present

	const result = validateRefreshToken(refreshToken, getClientIP(req));

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
	const result = validateRefreshToken(refreshToken, ip); // True for refresh token
	if (!result) return;

	ws.metadata.memberInfo = { ...ws.metadata.memberInfo, signedIn: true, ...result.payload };
}

export { resolveAuth, resolveAuth_WebSocket };
