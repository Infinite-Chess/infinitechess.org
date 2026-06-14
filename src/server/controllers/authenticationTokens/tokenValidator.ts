// src/server/controllers/authenticationTokens/tokenValidator.ts

/**
 * This script tests provided tokens for validation,
 * returning the decoded user information if they are,
 * renews their session if possible,
 * and updates their last_seen property in the database.
 */

import jwt from 'jsonwebtoken';

import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { doesMemberOfIDExist, updateLastSeen } from '../../database/memberManager.js';
import { refreshTokenGracePeriodMillis, TokenPayload } from './tokenSigner.js';
import {
	deleteRefreshToken,
	findRefreshToken,
	updateRefreshTokenIP,
	type RefreshTokenRecord,
} from '../../database/refreshTokenManager.js';

if (!process.env['ACCESS_TOKEN_SECRET']) throw new Error('Missing ACCESS_TOKEN_SECRET');
if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const ACCESS_TOKEN_SECRET = process.env['ACCESS_TOKEN_SECRET'];
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];

// Validating Tokens ---------------------------------------------------------------------------------

/**
 * Checks if an access token is valid => not expired,
 * nor tampered, and the user account still exists.
 */
function isAccessTokenValid(token: string): { payload: TokenPayload } | undefined {
	// Decode the token
	const payload = decodeToken(token, false);
	if (!payload) return undefined; // Expired or tampered

	try {
		// Check if the user account still exists.
		if (!doesMemberOfIDExist(payload.user_id)) return undefined; // Account deleted
	} catch {
		// DB error (already logged)
		return undefined;
	}

	try {
		updateLastSeen(payload.user_id);
	} catch {
		// DB error (already logged). Token is still valid
	}
	return { payload };
}

/**
 * Checks if a refresh token is valid. Not expired, nor tampered, and it's still
 * in the database (not manually invalidated by logging out, or deleting the account).
 * @param IP - Has a chance to not be defined on HTTP requests.
 */
function isRefreshTokenValid(
	token: string,
	IP?: string,
): { payload: TokenPayload; tokenRecord: RefreshTokenRecord } | undefined {
	// Decode the token
	const payload = decodeToken(token, true);
	if (!payload) return undefined; // Expired or tampered

	let tokenRecord: RefreshTokenRecord | undefined;
	try {
		// Check against the database
		tokenRecord = resolveRefreshTokenRecord(token, IP);
		if (!tokenRecord) return undefined; // Not in the database (logged out, account deleted, or rotated past its grace period)
	} catch {
		// DB error (already logged)
		return undefined;
	}

	try {
		updateLastSeen(payload.user_id);
	} catch {
		// DB error (already logged). Token is still valid
	}
	return { payload, tokenRecord };
}

/**
 * Checks if a specific refresh token is present in the database, and has not expired,
 * deleting it if it has expired, and updating its last used IP address if it has changed.
 * If not present, it means it has either expired, been manually invalidated by the user logging out, or deleting their account.
 *
 * Returns the token record if found and valid, otherwise undefined.
 * @throws If any database error occurs during the process.
 */
function resolveRefreshTokenRecord(token: string, IP?: string): RefreshTokenRecord | undefined {
	// Find the token in the database.
	const tokenRecord = findRefreshToken(token);

	if (!tokenRecord) return; // Token must have been manually invalidated by the user logging out, or deleting their account.

	const now = Date.now();

	// Check if it is naturally expired.
	if (tokenRecord.expires_at < now) {
		// The token is expired, remove it from the database for cleanup.
		deleteRefreshToken(token);
		return;
	}

	// Check if it was consumed (replaced) and the grace period has ended.
	if (
		tokenRecord.consumed_at !== null &&
		now - tokenRecord.consumed_at > refreshTokenGracePeriodMillis
	) {
		// The token is "dead" (grace period over). Remove it from the database.
		deleteRefreshToken(token);
		return;
	}

	// Update the IP address if it has changed.
	const IP_New: string | null = IP || null;
	if (IP_New !== tokenRecord.ip_address) {
		updateRefreshTokenIP(token, IP_New);
	}

	return tokenRecord;
}

/**
 * Extracts and decodes the payload from an access or refresh token.
 * @returns The decoded payload if the token is valid, or null if it is expired or tampered.
 */
function decodeToken(token: string, isRefreshToken: boolean): TokenPayload | null {
	const secret = isRefreshToken ? REFRESH_TOKEN_SECRET : ACCESS_TOKEN_SECRET;
	try {
		// Decode the JWT and return the payload
		const jwtPayload = jwt.verify(token, secret) as jwt.JwtPayload; // Can cast here because we know we originally signed it as an object, not a string.
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

export { isAccessTokenValid, isRefreshTokenValid };
