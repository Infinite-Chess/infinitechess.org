// src/server/controllers/logoutController.ts

import type { Request, Response } from 'express';

import { logEvents } from '../middleware/logEvents.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';

/** Handles member logout by revoking the session and deleting the refresh token. */
async function handleLogout(req: Request, res: Response): Promise<void> {
	// Delete the refresh token cookie...
	// On client, also delete the accessToken

	const cookies = req.cookies;
	const refreshToken = cookies['jwt'];
	if (typeof refreshToken !== 'string') {
		res.sendStatus(200); // Cookie already deleted. (Already logged out)
		return;
	}

	// Delete their existing session cookies WHETHER OR NOT they
	// are signed in, because they may THINK they are...
	revokeSession(res);

	if (!req.memberInfo?.signedIn) {
		// Existing refresh token cookie was invalid (tampered, expired, manually invalidated, or account deleted)
		res.sendStatus(200);
		return;
	}

	try {
		// Now invalidate the refresh token from the database by deleting it.
		deleteRefreshToken(refreshToken);
	} catch {
		// DB error (already logged)
		res.sendStatus(500);
		return;
	}

	closeAllSocketsOfSession(refreshToken, 1008, 'Logged out');

	res.sendStatus(200);

	logEvents(`Logged out member "${req.memberInfo.username}".`, 'loginAttempts.txt');
}

export { handleLogout };
