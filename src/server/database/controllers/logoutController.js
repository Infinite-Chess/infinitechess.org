
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
	if (user_id === undefined) return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found", req) }); // Tampered token, it didn't decode to anybody's username.

	const result = deleteRefreshToken(user_id, refreshToken); // { success (boolean), message (string), result }

	// Was the refreshToken in db?
	if (!result.success) return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found", req) }); // Forbidden, already deleted

	websocketserver.closeAllSocketsOfMember(username.toLowerCase(), 1008, "Logged out");
	deleteAllInvitesOfMember(username.toLowerCase());

	logEvents(`Logged out member "${username}".`, "loginAttempts.txt", { print: true });
	res.clearCookie('jwt', { httpOnly: true, sameSite: 'None', secure: true });

	res.redirect('/');
};

export { handleLogout };
