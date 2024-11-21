
// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!

import { logEvents } from "../../middleware/logEvents.js";
import { assignOrRenewBrowserID } from "../browserIDManager.js";
import { signAccessToken } from "./tokenSigner.js";



/**
 * How long until the cookie containing their new access token
 * will last until expiring, in milliseconds.
 * This is NOT when the token itself expires, only the cookie.
 */
const expireTimeOfTokenCookieMillis = 1000 * 10; // 10 seconds



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
		return res.status(403).json({'message': "Invalid or missing refresh token (logged out), cannot issue access token."}); // Forbidden
	}

	// Token is valid! Send them new access token!

	const { user_id, username, roles } = req.memberInfo;
	const accessToken = signAccessToken(user_id, username, roles);

	// SEND the token as a cookie!
	createAccessTokenCookie(res, accessToken); // 10 second expiry time
	res.json({ message: 'Issued access token!' }); // Their member information is now stored in a cookie when the refreshed token cookie is generated
	console.log(`Issued access token for member "${username}" --------`);
}


/**
 * Creates and sets an HTTP-only cookie containing the refresh token.
 * @param {Object} res - The response object.
 * @param {string} accessToken - The access token to be stored in the cookie.
 */
function createAccessTokenCookie(res, accessToken) {
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true
	res.cookie('token', accessToken, { sameSite: 'None', secure: true, maxAge: expireTimeOfTokenCookieMillis }); // 10 second time limit. JavaScript needs to read it in that time!
}

export {
	accessTokenIssuer
};