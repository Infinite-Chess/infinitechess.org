
import websocketserver from '../../wsserver.js';
import { getTranslationForReq } from "../../utility/translate.js";
import { deleteRefreshToken, getUserIDAndUsernameFromRefreshToken } from "./members.js";
import { deleteAllInvitesOfMember } from '../../game/invitesmanager/invitesmanager';
import { logEvents } from '../../middleware/logEvents.js';


const handleLogout = async(req, res) => {
	// On client, also delete the accessToken

	const cookies = req.cookies;
	// We need to delete refresh token cookie, but is it already?
	if (!cookies?.jwt) return res.redirect('/'); // Success, already logged out
	const refreshToken = cookies.jwt;

	const { user_id, username } = getUserIDAndUsernameFromRefreshToken(refreshToken);
	if (user_id === undefined) {
		logEvents(`Tampered refresh token did not decode to any user_id: "${refreshToken}"`, 'errLog.txt', { print: true })
		return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found", req) });
	}

	deleteRefreshToken(user_id, refreshToken);

	websocketserver.closeAllSocketsOfMember(username.toLowerCase(), 1008, "Logged out");
	deleteAllInvitesOfMember(username.toLowerCase());

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });

	res.redirect('/');
};

export { handleLogout };
