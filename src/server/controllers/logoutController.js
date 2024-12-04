
import { logEvents } from '../middleware/logEvents.js';
import { deleteAllInvitesOfMember } from '../game/invitesmanager/invitesmanager.js';
import { revokeSession } from '../controllers/authenticationTokens/sessionManager.js';
import { closeAllSocketsOfSession } from '../socket/socketManager.js';


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

	if (!req.memberInfo.signedIn) { // Existing refresh token cookie was invalid (tampered, expired, manually invalidated, or account deleted)
		// We can't use the higher-order doStuffOnLogout() here because we don't know their user_id and username
		// BUT this will delete their existing session cookies!
		revokeSession(res); 
		return res.redirect('/');
	}

	const { user_id, username } = req.memberInfo;
	
	doStuffOnLogout(res, user_id, username, refreshToken);

	res.redirect('/');

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
};

function doStuffOnLogout(res, user_id, username, refreshToken) {
	// Revoke our session and invalidate the refresh token from the database
	revokeSession(res, user_id, refreshToken);

	closeAllSocketsOfSession(refreshToken, 1008, "Logged out");
	deleteAllInvitesOfMember(username);
}

export {
	handleLogout,
	doStuffOnLogout,
};
