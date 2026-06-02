// src/server/controllers/authenticationTokens/tokenSigner.ts

/**
 * Tokens can be signed with the payload that includes any information we want!
 * We like to use user ID, username and roles.
 *
 * The benefit of signing access tokens with information is when we verify the tokens,
 * we don't have to do a database lookup to know who they are!
 *
 * Sessions are sliding: as long as the token is used before it expires, it gets renewed.
 */

import type { Role } from '../roles.js';

import jwt from 'jsonwebtoken';

import tokenConfig from '../../../shared/util/tokenConfig.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

/** The payload of the JWT token, containing user information. */
interface TokenPayload {
	user_id: number;
	username: string;
	roles: Role[] | null;
}

if (!process.env['ACCESS_TOKEN_SECRET']) throw new Error('Missing ACCESS_TOKEN_SECRET');
if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const ACCESS_TOKEN_SECRET = process.env['ACCESS_TOKEN_SECRET'];
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];

// Session tokens expiry times ------------------------------------------------------

/** The lifetime of a standard session refresh token, if never renewed. */
const DEFAULT_SESSION_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 2; // 48 hours
// const DEFAULT_SESSION_EXPIRY_MILLIS = 1000 * 20; // 20 seconds, for testing purposes.

/**
 * The lifetime of an extended session refresh token,
 * when "keep me logged in" is checked, if never renewed.
 */
const EXTENDED_SESSION_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 180; // 180 days (~6 months)

/** The window where a "consumed" token is still accepted. */
const refreshTokenGracePeriodMillis = 1000 * 10; // 10 seconds

// Signing Tokens ------------------------------------------------------------------------------------

/**
 * Signs and generates an access token for the user.
 */
function signAccessToken(user_id: number, username: string, roles: Role[] | null): string {
	const payload = generatePayload(user_id, username, roles);
	const accessTokenExpirySecs = tokenConfig.ACCESS_TOKEN_EXPIRY_MILLIS / 1000;
	return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: accessTokenExpirySecs }); // Typically short-lived, for in-memory storage only.
}

/**
 * Signs and generates a refresh token for the user.
 * The refresh token is long-lived (hours-days) and should be stored in an httpOnly cookie (not accessible via JS).
 * @param expiryMillis - How long, in milliseconds, the token should remain valid.
 */
function signRefreshToken(
	user_id: number,
	username: string,
	roles: Role[] | null,
	expiryMillis: number,
): string {
	const payload = generatePayload(user_id, username, roles);
	const refreshTokenExpirySecs = expiryMillis / 1000;
	return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: refreshTokenExpirySecs }); // Longer-lived, stored in an httpOnly cookie.
}

/** Generates the payload object for a JWT based on the user ID and username. */
function generatePayload(user_id: number, username: string, roles: Role[] | null): TokenPayload {
	return { user_id, username, roles };
}

export {
	DEFAULT_SESSION_EXPIRY_MILLIS,
	EXTENDED_SESSION_EXPIRY_MILLIS,
	refreshTokenGracePeriodMillis,
	signAccessToken,
	signRefreshToken,
};

export type { TokenPayload };
