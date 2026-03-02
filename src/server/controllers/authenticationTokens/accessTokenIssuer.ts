// src/server/controllers/authenticationTokens/accessTokenIssuer.ts

// Route
// Returns a new access token if refresh token hasn't expired.
// Called by a fetch(). ALWAYS RETURN a json!

import type { Request, Response } from 'express';

import { signAccessToken } from './tokenSigner.js';

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
 */
function accessTokenIssuer(req: Request, res: Response): void {
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		res.status(403).json({
			message: 'Invalid or missing refresh token (logged out), cannot issue access token.',
		}); // Forbidden
		return;
	}

	// Token is valid! Send them new access token!

	const { user_id, username, roles } = req.memberInfo;
	const accessToken = signAccessToken(user_id, username, roles);

	// SEND the token as a cookie!
	createAccessTokenCookie(res, accessToken); // 10 second expiry time
	res.json({ message: 'Issued access token!' }); // Their member information is now stored in a cookie when the refreshed token cookie is generated
	console.log(`Issued access token for member "${username}" --------`);
}

/** Creates and sets an HTTP-only cookie containing the refresh token. */
function createAccessTokenCookie(res: Response, accessToken: string): void {
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true
	res.cookie('token', accessToken, {
		sameSite: 'none',
		secure: true,
		maxAge: expireTimeOfTokenCookieMillis, // 10 second time limit. JavaScript needs to read it in that time!
	});
}

export { accessTokenIssuer };
