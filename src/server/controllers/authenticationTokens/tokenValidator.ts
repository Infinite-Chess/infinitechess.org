
// src/server/controllers/authenticationTokens/tokenValidator.ts

/**
 * This script tests provided tokens for validation,
 * returning the decoded user information if they are,
 * renews their session if possible,
 * and updates their last_seen property in the database.
 */

import jwt from 'jsonwebtoken';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { deleteRefreshToken, findRefreshToken, updateRefreshTokenIP, type RefreshTokenRecord } from '../../database/refreshTokenManager.js';
import { doesMemberOfIDExist, updateLastSeen } from '../../database/memberManager.js';

import type { TokenPayload } from './tokenSigner.js';


if (!process.env['ACCESS_TOKEN_SECRET']) throw new Error('Missing ACCESS_TOKEN_SECRET');
if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const ACCESS_TOKEN_SECRET = process.env['ACCESS_TOKEN_SECRET'];
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];


// Validating Tokens ---------------------------------------------------------------------------------


/**
 * Checks if an access token is valid => not expired,
 * nor tampered, and the user account still exists.
 */
function isAccessTokenValid(token: string): {
	isValid: true,
	payload: TokenPayload,
} | {
	isValid: false,
	reason: string,
} {
	// Decode the token
	const payload = decodeToken(token, false);
	if (!payload) return { isValid: false, reason: "Token is expired or tampered." };

	// Check if the user account still exists.
	if (!doesMemberOfIDExist(payload.user_id)) return { isValid: false, reason: "User account does not exist." };

	updateLastSeen(payload.user_id);
	return { isValid: true, payload };
}

/**
 * Checks if a refresh token is valid. Not expired, nor tampered, and it's still
 * in the database (not manually invalidated by logging out, or deleting the account).
 * @param token 
 * @param IP - Has a chance to not be defined on HTTP requests.
 * @returns 
 */
function isRefreshTokenValid(token: string, IP?: string): {
	isValid: true,
	payload: TokenPayload,
	tokenRecord: RefreshTokenRecord,
} | {
	isValid: false,
	reason: string,
} {
	// Decode the token
	const payload = decodeToken(token, true);
	if (!payload) return { isValid: false, reason: "Token is expired or tampered." };

	let tokenRecord: RefreshTokenRecord | undefined;
	try {
		// Check against the database
		tokenRecord = resolveRefreshTokenRecord(token, IP);
		if (!tokenRecord) return { isValid: false, reason: "Refresh token unable to be resolved in the database." };
	} catch (error) {
		// This block will catch any unexpected errors from database calls
		const errMsg = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`Error resolving refresh token in the database: ${errMsg}`, 'errLog.txt');
		return { isValid: false, reason: "An internal error occurred during validation." };
	}

	updateLastSeen(payload.user_id);
	return { isValid: true, payload, tokenRecord };
}

/**
 * Checks if a specific refresh token is present in the database, and has not expired,
 * deleting it if it has expired, and updating its last used IP address if it has changed.
 * If not present, it means it has either expired, been manually invalidated by the user logging out, or deleting their account.
 * 
 * Returns the token record if found and valid, otherwise undefined.
 */
function resolveRefreshTokenRecord(token: string, IP?: string): RefreshTokenRecord | undefined {
	// Find the token in the database.
	const tokenRecord = findRefreshToken(token);

	if (!tokenRecord) return; // Token must have been manually invalidated by the user logging out, or deleting their account.

	// Check if it is expired.
	if (tokenRecord.expires_at < Date.now()) {
		// The token is expired, remove it from the database for cleanup.
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


/** Extracts and decodes the payload from an access or refresh token. */
function decodeToken(token: string, isRefreshToken: boolean): TokenPayload | undefined {
	const secret = isRefreshToken ? REFRESH_TOKEN_SECRET : ACCESS_TOKEN_SECRET;
	try {
		// Decode the JWT and return the payload
		const jwtPayload = jwt.verify(token, secret) as jwt.JwtPayload; // Can cast here because we know we originally signed it as an object, not a string.
		return {
			user_id: jwtPayload['user_id'],
			username: jwtPayload['username'],
			roles: jwtPayload['roles'],
		};
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		// Log the error event when verification fails
		logEventsAndPrint(`Failed to decode token (isRefreshToken: ${isRefreshToken}): ${errMsg}. Token: "${token}"`, 'errLog.txt');
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}


export {
	isAccessTokenValid,
	isRefreshTokenValid,
};