// src/server/controllers/logoutController.js

import { logEventsAndPrint } from '../middleware/logEvents.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { deleteRefreshToken } from '../database/refreshTokenManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';

/**
 *
 * @param {import('../types.js').IdentifiedRequest} req
 * @param {*} res
 * @returns
 */
async function handleLogout(req, res) {
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
		logEventsAndPrint(
			`Critical error when logging out member "${req.memberInfo.username}": ${e.message}`,
			'errLog.txt',
		);
		return res.status(500).json({ message: 'Server Error' });
	}

	closeAllSocketsOfSession(refreshToken, 1008, 'Logged out');

	res.redirect('/');

	logEventsAndPrint(`Logged out member "${req.memberInfo.username}".`, 'loginAttempts.txt');
}

export { handleLogout };
