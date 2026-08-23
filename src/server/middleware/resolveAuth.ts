// src/server/middleware/resolveAuth.ts

/**
 * Reads a request's refresh-token cookie, validates it against the database,
 * and sets `req.memberInfo` with the signed-in user's identity.
 */

import type { Request, Response, NextFunction } from 'express';

import { getClientIP } from '../utility/IP.js';
import { ParsedCookies } from '../types.js';
import { logEventsAndPrint } from '../utility/logEvents.js';
import { validateRefreshToken } from '../database/refreshTokenManager.js';
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

export { resolveAuth };
