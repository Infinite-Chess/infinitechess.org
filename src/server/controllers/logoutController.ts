// src/server/controllers/logoutController.ts

import type { Request, Response } from 'express';

import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';

/** Handles member logout by revoking the session and deleting the refresh token. */
async function handleLogout(req: Request, res: Response): Promise<void> {
	// Delete the refresh token cookie...
	// On client, also delete the accessToken

	const cookies = req.cookies;
	const refreshToken = cookies['jwt'];
	if (typeof refreshToken !== 'string') return res.redirect('/'); // Cookie already deleted. (Already logged out)

	// Delete their existing session cookies WHETHER OR NOT they
	// are signed in, because they may THINK they are...
	revokeSession(res);

	if (!req.memberInfo?.signedIn) {
		// Existing refresh token cookie was invalid (tampered, expired, manually invalidated, or account deleted)
		res.redirect('/');
		return;
	}

	try {
		// Now invalidate the refresh token from the database by deleting it.
		deleteRefreshToken(refreshToken);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		logEventsAndPrint(
			`Critical error when logging out member "${req.memberInfo.username}": ${message}`,
			'errLog.txt',
		);
		res.status(500).json({ message: 'Server Error' });
		return;
	}

	closeAllSocketsOfSession(refreshToken, 1008, 'Logged out');

	res.redirect('/');

	logEventsAndPrint(`Logged out member "${req.memberInfo.username}".`, 'loginAttempts.txt');
}

export { handleLogout };
