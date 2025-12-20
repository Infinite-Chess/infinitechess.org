// src/server/controllers/authenticationTokens/tokenSigner.ts

/**
 * Tokens can be signed with the payload that includes any information we want!
 * We like to use user ID, username and roles.
 *
 * The benefit of signing access tokens with information is when we verify the tokens,
 * we don't have to do a database lookup to know who they are!
 */

import jwt from 'jsonwebtoken';

/** The payload of the JWT token, containing user information. */
interface TokenPayload {
	user_id: number;
	username: string;
	roles: string[] | null;
}

if (!process.env['ACCESS_TOKEN_SECRET']) throw new Error('Missing ACCESS_TOKEN_SECRET');
if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const ACCESS_TOKEN_SECRET = process.env['ACCESS_TOKEN_SECRET'];
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];

// Session tokens expiry times ------------------------------------------------------

const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes
const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
// const refreshTokenExpiryMillis = 1000 * 20; // 20 seconds

/** The window where a "consumed" token is still accepted. */
const refreshTokenGracePeriodMillis = 1000 * 10; // 10 seconds

// Signing Tokens ------------------------------------------------------------------------------------

/**
 * Signs and generates an access token for the user.
 */
function signAccessToken(user_id: number, username: string, roles: string[] | null): string {
	const payload = generatePayload(user_id, username, roles);
	const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
	return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: accessTokenExpirySecs }); // Typically short-lived, for in-memory storage only.
}

/**
 * Signs and generates a refresh token for the user.
 * The refresh token is long-lived (hours-days) and should be stored in an httpOnly cookie (not accessible via JS).
 */
function signRefreshToken(user_id: number, username: string, roles: string[] | null): string {
	const payload = generatePayload(user_id, username, roles);
	const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;
	return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: refreshTokenExpirySecs }); // Longer-lived, stored in an httpOnly cookie.
}

/** Generates the payload object for a JWT based on the user ID and username. */
function generatePayload(user_id: number, username: string, roles: string[] | null): TokenPayload {
	return { user_id, username, roles };
}

export {
	accessTokenExpiryMillis,
	refreshTokenExpiryMillis,
	refreshTokenGracePeriodMillis,
	signAccessToken,
	signRefreshToken,
};

export type { TokenPayload };
