
// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!

import { getTranslationForReq } from "../../utility/translate";
import { createAccessTokenCookie } from "./accessTokenController";
import { assignOrRenewBrowserID } from "./browserIDController";
import { updateLastSeen } from "./memberController";
import { isTokenValid, signAccessToken } from "./tokenController";

/**
 * Called when the browser uses the /api/get-access-token API request. This reads any refresh token cookie present,
 * and gives them a new access token if they are signed in.
 * If they are not, it gives them a browser-id cookie to verify their identity.
 * @param {*} req 
 * @param {*} res 
 */
function accessTokenIssuer(req, res) {
	const cookies = req.cookies;
	// If we have cookies AND there's a jwt property..
	if (!cookies?.jwt) {
		assignOrRenewBrowserID(req, res);
		return res.status(401).json({'message' : getTranslationForReq("server.javascript.ws-refresh_token_expired", req) });
	}
	const refreshToken = cookies.jwt;

	// { isValid (boolean), user_id, username, roles }
	const results = isTokenValid(refreshToken, true); // true for isRefreshToken
	if (!results.isValid) {
		assignOrRenewBrowserID(req, res);
		return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_invalid", req) }); // Conflict. Expired or tampered token, or logged out (manually invalidated).
		// return res.status(403).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found_logged_out", req) });
	}

	// Token is valid! Send them new access token!

	const { user_id, username, roles } = results;
	const allowedActions = ['open-socket'];
	const accessToken = signAccessToken(user_id, username, roles, allowedActions);

	// SEND the token as a cookie!
	createAccessTokenCookie(res, accessToken); // 10 second expiry time
	// res.json({ user_id, member: username });
	res.sendStatus(200); // Their member information is now stored in a cookie when the refreshed token cookie is generated
	console.log(`Issued access token for member "${username}" --------`);

	// Update their last-seen variable
	updateLastSeen(user_id);
}

export {
	accessTokenIssuer
};