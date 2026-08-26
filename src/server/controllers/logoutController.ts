// src/server/controllers/logoutController.ts

/**
 * Ends a session: clears its cookies, deletes its refresh token, and closes every
 * socket it opened.
 */

import type { Request, Response } from 'express';

import socketutil from '../../shared/util/socketutil.js';

import logEvents from '../utility/logEvents.js';
import sessionManager from '../auth/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import refreshTokenManager from '../database/refreshTokenManager.js';

/** `POST /api/logout` — revokes the caller's session, deletes its refresh token, and closes its sockets. */
async function handle(req: Request, res: Response): Promise<void> {
	// Always clear the client's session cookies, signed in or not.
	sessionManager.revoke(res);

	const refreshToken = req.cookies['jwt'];
	if (refreshToken && typeof refreshToken === 'string') {
		// string, and not empty
		try {
			// Invalidate the token server-side.
			refreshTokenManager.remove(refreshToken);
		} catch {
			// DB error (already logged)
			res.sendStatus(500);
			return;
		}
		socketRegistry.closeAllOfSession(refreshToken, 1008, socketutil.ClosureReasons.LOGGED_OUT);
	}

	res.sendStatus(200);

	logEvents.add(`Logged out a member.`, 'loginAttempts');
}

// Exports ---------------------------------------------------------------------

export default { handle };
