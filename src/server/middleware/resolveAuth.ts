// src/server/middleware/resolveAuth.ts

/**
 * Reads a request's refresh-token cookie, validates it against the database,
 * and sets `req.memberInfo` with the signed-in user's identity.
 */

import type { Request, Response, NextFunction } from 'express';

import jsutil from '../../shared/util/jsutil.js';

import ip from '../utility/ip.js';
import logEvents from '../utility/logEvents.js';
import sessionManager from '../auth/sessionManager.js';
import identityResolver from '../auth/identityResolver.js';
import { ParsedCookies } from '../types.js';

/**
 * [HTTP] Resolves identity from the refresh-token cookie, setting `req.memberInfo` so downstream
 * middleware can gate private data. Also renews active sessions. Does DB work — only use on routes
 * that need authentication.
 */
function resolve(req: Request, res: Response, next: NextFunction): void {
	// Idempotent: skip if auth was already resolved for this request
	if (req.memberInfo !== undefined) return next();

	const cookies: ParsedCookies = req.cookies;
	req.memberInfo = { signedIn: false, browser_id: cookies['browser-id'] };

	tryRefreshToken(req, res);

	next();
}

/**
 * [HTTP] Validates the request's refresh token cookie, updating `req.memberInfo` if it is
 * valid (they are signed in). Revokes or renews their session cookies accordingly.
 */
function tryRefreshToken(req: Request, res: Response): void {
	const cookies: ParsedCookies = req.cookies;

	const { memberInfo, validation } = identityResolver.resolveIdentity(
		req.memberInfo!,
		cookies.jwt,
		ip.get(req),
	);

	if (!validation && cookies.jwt) {
		// Revoke their session now, in case they were manually logged out, and their client didn't know that.
		sessionManager.revoke(res);
	} else if (validation) {
		const payload = validation.payload;
		try {
			// Renew the session if it was issued more than a day ago.
			sessionManager.freshen(
				req,
				res,
				payload.user_id,
				payload.username,
				payload.roles,
				validation.tokenRecord,
			);
		} catch (error) {
			const errMsg = jsutil.getErrorMessage(error);
			logEvents.addAndPrint(`Error freshening session: ${errMsg}`, 'errLog');
		}
	}

	req.memberInfo = memberInfo;
}

// Exports ---------------------------------------------------------------------

export default { resolve };
