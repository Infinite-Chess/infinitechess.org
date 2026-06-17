// src/server/controllers/authenticationTokens/accessTokenIssuer.ts

// Route
// Returns a new access token (as a cookie) if the
// refresh token hasn't expired. Called by a fetch().

import type { Request, Response } from 'express';

import { signAccessToken } from './tokenSigner.js';

/**
 * How long until the cookie containing their new access token
 * will last until expiring, in milliseconds.
 * This is NOT when the token itself expires, only the cookie.
 */
const expireTimeOfTokenCookieMillis = 1000 * 10; // 10 seconds

/**
 * `POST /api/access-token` — if the refresh-token cookie proves the
 * caller is signed in, issues a new short-lived access-token cookie.
 */
function accessTokenIssuer(req: Request, res: Response): void {
	if (!req.memberInfo || !req.memberInfo.signedIn) {
		// Invalid or missing refresh token (logged out), cannot issue access token.
		res.sendStatus(403); // Forbidden
		return;
	}

	// Token is valid! Send them new access token!

	const { user_id, username, roles } = req.memberInfo;
	const accessToken = signAccessToken(user_id, username, roles);

	// SEND the token as a cookie! Their member information is also
	// stored in a cookie when the refreshed token cookie is generated.
	createAccessTokenCookie(res, accessToken); // 10 second expiry time
	res.sendStatus(200);
	// console.log(`Issued access token for member "${username}" --------`);
}

/** Creates a JavaScript-readable cookie containing the access token, with a short expiry time. */
function createAccessTokenCookie(res: Response, accessToken: string): void {
	res.cookie('token', accessToken, {
		sameSite: 'lax',
		secure: true,
		maxAge: expireTimeOfTokenCookieMillis, // 10 second time limit. JavaScript needs to read it in that time!
	});
}

export { accessTokenIssuer };
