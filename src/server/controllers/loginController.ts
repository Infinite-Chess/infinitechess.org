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

import { createNewSession } from './authenticationTokens/sessionManager.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { testPasswordForRequest } from './authController.js';
import { updateLoginCountAndLastSeen } from '../database/memberManager.js';
import { escapeLogControlChars, logEvents, logEventsAndPrint } from '../middleware/logEvents.js';

/**
 * Called when the login page submits login form data.
 * Tests their username and password. If correct, it logs
 * them in, generates tokens for them, and updates their member variables.
 * THIS SHOULD ALWAYS send a json response, because the errors we send are displayed on the page.
 */
async function handleLogin(req: Request, res: Response): Promise<void> {
	// Initial check - if this fails, it sends a response and returns.
	const identity = await testPasswordForRequest(req, res);
	if (!identity) return;
	// Correct password...

	// CLEANUP: If the browser already holds a session, its token is about to be
	// become dead weight from the new session's cookie, so invalidate it server-side.
	// This can happen when a user tries to log in while already logged in.
	const oldRefreshToken = req.cookies['jwt'];
	if (typeof oldRefreshToken === 'string' && oldRefreshToken) {
		// string, and not empty
		try {
			deleteRefreshToken(oldRefreshToken);
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
		const parsedRoles = identity.roles !== null ? JSON.parse(identity.roles) : null;

		createNewSession(req, res, identity.user_id, identity.username, parsedRoles, keepLoggedIn);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the detailed error for server-side debugging.
		logEventsAndPrint(
			`Error during handleLogin for user "${escapeLogControlChars(String(req.body.username))}": ${message}`,
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
		updateLoginCountAndLastSeen(identity.user_id);
	} catch {
		// Already logged
	}
	logEvents(`Logged in member "${identity.username}".`, 'loginAttempts');
}

export { handleLogin };
