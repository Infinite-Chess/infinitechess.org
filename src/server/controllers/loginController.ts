// src/server/controllers/loginController.ts

/**
 * This controller is used when a client logs in.
 *
 * This rate limits a members login attempts,
 * and when they successfully login:
 *
 * Creates a new login session,
 * and updates last_seen and login_count in their profile.
 */

import type { Request, Response } from 'express';

import jsutil from '../../shared/util/jsutil.js';

import roles from './roles.js';
import logEvents from '../utility/logEvents.js';
import memberManager from '../database/memberManager.js';
import sessionManager from './sessionManager.js';
import authController from './authController.js';
import refreshTokenManager from '../database/refreshTokenManager.js';

/**
 * `POST /api/auth` — verifies the submitted username/password and, on success, logs the user
 * in (issues tokens, updates member vars). Always responds JSON; errors are shown on the page.
 */
async function handle(req: Request, res: Response): Promise<void> {
	// Initial check - if this fails, it sends a response and returns.
	const identity = await authController.testPasswordForRequest(req, res);
	if (!identity) return;
	// Correct password...

	// CLEANUP: If the browser already holds a session, its old token is about to become
	// dead weight once the new session's cookie replaces it, so invalidate it server-side.
	// This can happen when a user tries to log in while already logged in.
	const oldRefreshToken = req.cookies['jwt'];
	if (typeof oldRefreshToken === 'string' && oldRefreshToken) {
		// string, and not empty
		try {
			refreshTokenManager.remove(oldRefreshToken);
		} catch {
			// DB error (already logged). Don't block the new login over this.
		}
		// Sockets open on the old session are intentionally NOT
		// closed for UX. They expire & reconnect within ~15m anyway
	}

	/** Whether the user checked "keep me logged in". */
	const keepLoggedIn = req.body.keepLoggedIn === true;

	try {
		// The roles fetched from the database is a stringified json string array, parse it here!
		const parsedRoles = roles.parse(identity.roles);

		sessionManager.create(req, res, identity.user_id, identity.username, parsedRoles, keepLoggedIn); // prettier-ignore
	} catch (error: unknown) {
		const detail = jsutil.getErrorMessage(error);
		// Log the detailed error for server-side debugging.
		logEvents.addAndPrint(
			`Error during handle for user "${logEvents.escapeLogNewlines(String(req.body.username))}": ${detail}`,
			'errLog',
		);
		// Send a generic error response to the client.
		res.status(500).json({
			message: req.t.responses.auth.login_failed,
		});
		return;
	}

	res.status(200).json({ message: 'Logged in successfully.' });

	// These operations are "fire and forget" in terms of the client response
	try {
		memberManager.updateLoginCountAndLastSeen(identity.user_id);
	} catch {
		// Already logged
	}
	logEvents.add(`Logged in member "${identity.username}".`, 'loginAttempts');
}

// Exports ------------------------------------------------------------------------------------

export default { handle };
