// src/server/controllers/logoutController.ts

import type { Request, Response } from 'express';

import socketutil from '../../shared/util/socketutil.js';

import { logEvents } from '../utility/logEvents.js';
import sessionManager from './authenticationTokens/sessionManager.js';
import socketRegistry from '../socket/socketRegistry.js';
import refreshTokenManager from '../database/refreshTokenManager.js';

/** `POST /api/logout` — revokes the caller's session, deletes its refresh token, and closes its sockets. */
async function handleLogout(req: Request, res: Response): Promise<void> {
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

	logEvents(`Logged out a member.`, 'loginAttempts');
}

export { handleLogout };
