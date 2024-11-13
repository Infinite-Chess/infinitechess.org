
import websocketserver from '../../wsserver.js';
import { logEvents } from '../../middleware/logEvents.js';
import { deleteRefreshTokenCookie, deleteRefreshTokenFromMemberData } from './refreshTokenController.js';
import { deleteAllInvitesOfMember } from '../../game/invitesmanager/invitesmanager.js';


const handleLogout = async(req, res) => {
	if (!req.memberInfo) {
		logEvents("req.memberInfo must be defined for us to log out!", 'errLog.txt', { print: true });
		return res.status(500).json({'message' : "Server Error" });
	}

	// Delete the refresh token cookie...
	// On client, also delete the accessToken

	const cookies = req.cookies;
	const refreshToken = cookies.jwt;
	if (!refreshToken) return res.redirect('/'); // Cookie already deleted. (Already logged out)

	if (!req.memberInfo.signedIn) return res.redirect('/'); // Existing cookie was invalid

	const { user_id, username } = req.memberInfo;
	deleteRefreshTokenFromMemberData(user_id, refreshToken);

	websocketserver.closeAllSocketsOfMember(username.toLowerCase(), 1008, "Logged out");
	deleteAllInvitesOfMember(username.toLowerCase());

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });
	deleteRefreshTokenCookie(res);

	res.redirect('/');
};

export { handleLogout };
