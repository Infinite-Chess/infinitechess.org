// src/server/utility/tokenSigner.ts

/**
 * Signs and verifies refresh tokens: JWTs whose payload carries the
 * member's identity (user ID, username and roles).
 *
 * The benefit of signing access tokens with information is when we verify the tokens,
 * we don't have to do a database lookup to know who they are!
 *
 * Sessions are sliding: as long as the token is used before it expires, it gets renewed.
 */

import type { Role } from '../types.js';

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

// Types ------------------------------------------------------------------------------------------

/** The payload of the JWT token, containing user information. */
interface TokenPayload {
	user_id: number;
	username: string;
	roles: Role[] | null;
}

// Constants --------------------------------------------------------------------------------------

if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];

/** The lifetime of a standard session refresh token, if never renewed. */
const DEFAULT_SESSION_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 2; // 48 hours
// const DEFAULT_SESSION_EXPIRY_MILLIS = 1000 * 20; // 20 seconds, for testing purposes.

/**
 * The lifetime of an extended session refresh token,
 * when "keep me logged in" is checked, if never renewed.
 */
const EXTENDED_SESSION_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 180; // 180 days (~6 months)

// Signing Tokens ------------------------------------------------------------------------------------

/**
 * Signs and generates a refresh token for the user.
 * The refresh token is long-lived (hours-days) and should be stored in an httpOnly cookie (not accessible via JS).
 * @param expiryMillis - How long, in milliseconds, the token should remain valid.
 * @throws If the token fails to sign (payload not serializable, bad expiresIn, etc).
 */
function signRefreshToken(
	user_id: number,
	username: string,
	roles: Role[] | null,
	expiryMillis: number,
): string {
	const payload = generatePayload(user_id, username, roles);
	const refreshTokenExpirySecs = expiryMillis / 1000;
	return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
		// Longer-lived than access tokens, and stored in an httpOnly cookie
		expiresIn: refreshTokenExpirySecs,
		// Makes every token unique, even when signed for the same user within
		// the same second, preventing a DB UNIQUE constraint error on the token.
		jwtid: crypto.randomUUID(),
	});
}

/** Generates the payload object for a JWT based on the user ID and username. */
function generatePayload(user_id: number, username: string, roles: Role[] | null): TokenPayload {
	return { user_id, username, roles };
}

// Verifying Tokens ------------------------------------------------------------------------------------

/**
 * Extracts and decodes the payload from a refresh token, verifying its signature and expiry.
 * @returns The decoded payload, or null if verification failed — expired, tampered, or malformed.
 */
function verifyTokenPayload(token: string): TokenPayload | null {
	try {
		// Can cast because we know we originally signed it as an object, not a string.
		const jwtPayload = jwt.verify(token, REFRESH_TOKEN_SECRET) as jwt.JwtPayload;
		return {
			user_id: jwtPayload['user_id'],
			username: jwtPayload['username'],
			roles: jwtPayload['roles'],
		};
	} catch {
		// Verification failed. Not logged: every cause is expected — an expired token
		// (commonly a backgrounded/sleeping tab reusing a stale token), or a malformed/tampered
		// token (typically bots & scanners probing endpoints with junk bearer tokens).
		return null;
	}
}

// Exports ------------------------------------------------------------------------------------------------

export {
	DEFAULT_SESSION_EXPIRY_MILLIS,
	EXTENDED_SESSION_EXPIRY_MILLIS,
	signRefreshToken,
	verifyTokenPayload,
};

export type { TokenPayload };
