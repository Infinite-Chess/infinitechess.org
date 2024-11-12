
import websocketserver from '../../wsserver.js';
import { getTranslationForReq } from "../../utility/translate.js";
import { getUserIDAndUsernameFromRefreshToken } from "./memberController.js";
import { deleteAllInvitesOfMember } from '../../game/invitesmanager/invitesmanager';
import { logEvents } from '../../middleware/logEvents.js';
import { deleteToken } from './tokenController.js';


const handleLogout = async(req, res) => {
	// On client, also delete the accessToken

	const cookies = req.cookies;
	// We need to delete refresh token cookie, but is it already?
	if (!cookies?.jwt) return res.redirect('/'); // Success, already logged out
	const refreshToken = cookies.jwt;

	const { user_id, username } = getUserIDAndUsernameFromRefreshToken(refreshToken);
	if (user_id === undefined) {
		logEvents(`When logging out, tampered refresh token did not decode to any user_id: "${refreshToken}" Perhaps it expired server-side but their client never deleted it?`, 'errLog.txt', { print: true });
		// return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found", req) });
		return res.redirect('/'); // Return this instead just in case there's a bug.
	}

	deleteToken(user_id, refreshToken, true); // true if isRefreshToken
	// They didn't pass an access token in the request so don't delete that here.

	websocketserver.closeAllSocketsOfMember(username.toLowerCase(), 1008, "Logged out");
	deleteAllInvitesOfMember(username.toLowerCase());

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });

	res.redirect('/');
};

export { handleLogout };
