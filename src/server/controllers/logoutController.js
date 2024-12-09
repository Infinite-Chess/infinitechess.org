
import { logEvents } from '../middleware/logEvents.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { deleteRefreshTokenFromMemberData } from '../database/refreshTokenManager.js';


async function handleLogout(req, res) {
	if (!req.memberInfo) {
		logEvents("req.memberInfo must be defined for us to log out!", 'errLog.txt', { print: true });
		return res.status(500).json({'message' : "Server Error" });
	}

	// Delete the refresh token cookie...
	// On client, also delete the accessToken

	const cookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return res.redirect('/'); // Cookie already deleted. (Already logged out)

	// Delete their existing session cookies WHETHER OR NOT they
	// are signed in, because they may THINK they are...
	revokeSession(res);

	if (!req.memberInfo.signedIn) return res.redirect('/'); // Existing refresh token cookie was invalid (tampered, expired, manually invalidated, or account deleted)

	const { user_id, username } = req.memberInfo;
	
	// Now invalidate the refresh token from the database by deleting it.
	deleteRefreshTokenFromMemberData(user_id, refreshToken);

	res.redirect('/');

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
};

export {
	handleLogout,
};
