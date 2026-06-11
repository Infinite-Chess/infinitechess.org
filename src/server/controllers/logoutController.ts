// src/server/controllers/logoutController.ts

import type { Request, Response } from 'express';

import { logEvents } from '../middleware/logEvents.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';

/** Handles member logout by revoking the session and deleting the refresh token. */
async function handleLogout(req: Request, res: Response): Promise<void> {
	// Always clear the client's session cookies, signed in or not.
	revokeSession(res);

	const refreshToken = req.cookies['jwt'];
	if (typeof refreshToken === 'string' && refreshToken) {
		// string, and not empty
		try {
			// Invalidate the token server-side. Safely no-ops if it isn't in the DB
			deleteRefreshToken(refreshToken);
		} catch {
			// DB error (already logged)
			res.sendStatus(500);
			return;
		}
		closeAllSocketsOfSession(refreshToken, 1008, 'Logged out');
	}

	res.sendStatus(200);

	logEvents(`Logged out a member.`, 'loginAttempts.txt');
}

export { handleLogout };
