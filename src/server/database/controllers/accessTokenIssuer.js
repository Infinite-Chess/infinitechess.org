
// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!

import { logEvents } from "../../middleware/logEvents.js";
import { getTranslationForReq } from "../../utility/translate.js";
import { createAccessTokenCookie } from "./accessTokenController.js";
import { assignOrRenewBrowserID } from "./browserIDController.js";
import { updateLastSeen } from "./memberController.js";
import { isTokenValid, signAccessToken } from "./tokenController.js";

/**
 * Called when the browser uses the /api/get-access-token API request. This reads any refresh token cookie present,
 * and gives them a new access token if they are signed in.
 * If they are not, it gives them a browser-id cookie to verify their identity.
 * @param {*} req 
 * @param {*} res 
 */
function accessTokenIssuer(req, res) {
	if (!req.memberInfo) {
		logEvents("req.memberInfo must be defined for access token issuer route!", 'errLog.txt', { print: true });
		return res.status(500).json({'message' : "Server Error" });
	}

	if (!req.memberInfo.signedIn) {
		assignOrRenewBrowserID(req, res);
		// return res.status(409).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_invalid", req) }); // Conflict. Expired or tampered token, or logged out (manually invalidated).
		return res.status(403).json({'message': getTranslationForReq("server.javascript.ws-refresh_token_not_found_logged_out", req) });
	}

	// Token is valid! Send them new access token!

	const { user_id, username, roles } = req.memberInfo;
	const accessToken = signAccessToken(user_id, username, roles);

	// SEND the token as a cookie!
	createAccessTokenCookie(res, accessToken); // 10 second expiry time
	res.json({ message: 'Issued access token!' }); // Their member information is now stored in a cookie when the refreshed token cookie is generated
	console.log(`Issued access token for member "${username}" --------`);
}

export {
	accessTokenIssuer
};