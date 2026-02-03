// src/server/controllers/logoutController.ts

import { logEventsAndPrint } from '../middleware/logEvents.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';

import type { IdentifiedRequest } from '../types.js';
import type { Response } from 'express';

/**
 * Handles member logout by revoking the session and deleting the refresh token.
 * @param req - The identified request object.
 * @param res - The response object.
 */
async function handleLogout(req: IdentifiedRequest, res: Response): Promise<void> {
	// Delete the refresh token cookie...
	// On client, also delete the accessToken

	const cookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return res.redirect('/'); // Cookie already deleted. (Already logged out)

	// Delete their existing session cookies WHETHER OR NOT they
	// are signed in, because they may THINK they are...
	revokeSession(res);

	if (!req.memberInfo.signedIn) return res.redirect('/'); // Existing refresh token cookie was invalid (tampered, expired, manually invalidated, or account deleted)

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
