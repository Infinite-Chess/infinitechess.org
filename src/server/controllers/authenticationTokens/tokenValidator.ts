
// src/server/controllers/authenticationTokens/tokenValidator.ts

/**
 * This script tests provided tokens for validation,
 * returning the decoded user information if they are,
 * renews their session if possible,
 * and updates their last_seen property in the database.
 */

import jwt from 'jsonwebtoken';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { doesMemberHaveRefreshToken_RenewSession, revokeSession } from './sessionManager.js';
import { Request, Response } from 'express';
import { TokenPayload } from './tokenSigner.js';
// @ts-ignore
import { doesMemberOfIDExist, updateLastSeen } from '../../database/memberManager.js';


if (!process.env['ACCESS_TOKEN_SECRET']) throw new Error('Missing ACCESS_TOKEN_SECRET');
if (!process.env['REFRESH_TOKEN_SECRET']) throw new Error('Missing REFRESH_TOKEN_SECRET');
const ACCESS_TOKEN_SECRET = process.env['ACCESS_TOKEN_SECRET'];
const REFRESH_TOKEN_SECRET = process.env['REFRESH_TOKEN_SECRET'];


// Validating Tokens ---------------------------------------------------------------------------------


/** The result of validating an access or refresh token. */
type ValidationResult = {
	isValid: true,
	payload: TokenPayload,
} | {
	isValid: false,
	reason: string,
};


/**
 * Checks if an access token is valid => not expired,
 * nor tampered, and the user account still exists.
 */
function isAccessTokenValid(token: string, res: Response): ValidationResult {
	// Decode the token
	const payload = decodeToken(token, false);
	if (!payload) return { isValid: false, reason: "Token is expired or tampered." };

	// Check if the user account still exists.
	if (!doesMemberOfIDExist(payload.user_id)) {
		revokeSession(res);
		return { isValid: false, reason: "User account does not exist." };
	}

	updateLastSeen(payload.user_id);
	return { isValid: true, payload };
}

/**
 * Checks if a refresh token is valid. Not expired, nor tampered, and it's still
 * in the database (not manually invalidated by logging out, or deleting the account).
 * @param token 
 * @param IP - Has a chance to not be defined on HTTP requests.
 * @param req - Will only be defined on HTTP requests, not websocket upgrade connection requests. If present, we are able to revoke or renew their session.
 * @param res - Will only be defined on HTTP requests, not websocket upgrade connection requests. If present, we are able to revoke or renew their session.
 * @returns 
 */
function isRefreshTokenValid(token: string, IP?: string, req?: Request, res?: Response): ValidationResult {
	// Decode the token
	const payload = decodeToken(token, true);
	if (!payload) return { isValid: false, reason: "Token is expired or tampered." };

	try {
		// Check against the database
		const isStoredInDb = doesMemberHaveRefreshToken_RenewSession(payload.user_id, payload.username, payload.roles, token, IP, req, res);
		if (!isStoredInDb) {
			if (res) revokeSession(res); // Revoke their session in case they were manually logged out, and their client didn't know that. The response may not be defined if we called this method on a websocket upgrade connection request.
			return { isValid: false, reason: "Refresh token not found in the database." };
		}
	} catch (error) {
		// This block will catch any unexpected errors from database calls
		const errMsg = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`A critical error occurred during refresh token validation: ${errMsg}`, 'errLog.txt');
		return { isValid: false, reason: "An internal error occurred during validation." };
	}

	updateLastSeen(payload.user_id);
	return { isValid: true, payload };
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