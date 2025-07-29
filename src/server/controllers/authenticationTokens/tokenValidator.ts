
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


/**
 * Checks if a token is valid.
 * This checks the following conditions:
 * 1. If the token has expired or has been tampered with (payload won't have required properties).
 * 2. If the token is manually invalidated, such as when a user logs out, or deletes their account, and the token was removed from their information in the members table.
 */
function isTokenValid(token: string, isRefreshToken: boolean, IP?: string, req?: Request, res?: Response): {
	isValid: true,
	payload: TokenPayload,
} | {
	isValid: false,
	reason: string,
} {
	try {
		if (isRefreshToken === undefined) {
			const reason = "isTokenValid requires the isRefreshToken parameter.";
			logEventsAndPrint(reason, 'errLog.txt');
			return { isValid: false, reason };
		}

		// 1. Decode the token first
		const payload = decodeToken(token, isRefreshToken);
		if (!payload) return { isValid: false, reason: "Token is expired or tampered." };

		if (!isRefreshToken) {
			// 2. If it's an access token, check if the user account still exists.
			
			if (!doesMemberOfIDExist(payload.user_id)) {
				console.log(`Token is for a deleted user account (ID: ${payload.user_id}).`);
				if (res) revokeSession(res); // The response may not be defined if we called this method on a websocket upgrade connection request.
				return { isValid: false, reason: "User account does not exist." };
			}

			// Validation complete for access token.

			updateLastSeen(payload.user_id);
			return { isValid: true, payload };
		} else {
			// 3. For a refresh token, check against the database.

			const isStoredInDb = doesMemberHaveRefreshToken_RenewSession(payload.user_id, payload.username, payload.roles, token, IP, req, res);
			if (!isStoredInDb) {
				if (res) revokeSession(res); // Revoke their session in case they were manually logged out, and their client didn't know that. The response may not be defined if we called this method on a websocket upgrade connection request.
				return { isValid: false, reason: "Refresh token not found in the database." };
			}

			// 4. If all checks pass, the token is valid.
			updateLastSeen(payload.user_id);
			return { isValid: true, payload };
		}
	} catch (error) {
		// This block will catch any unexpected errors from database calls
		const errMsg = error instanceof Error ? error.message : String(error);
		logEventsAndPrint(`A critical error occurred during token validation: ${errMsg}`, 'errLog.txt');
		
		return { isValid: false, reason: "An internal error occurred during validation." };
	}
}

/** Extracts and decodes the payload from an access or refresh token. */
function decodeToken(token: string, isRefreshToken: boolean): TokenPayload | undefined {
	const secret = isRefreshToken ? REFRESH_TOKEN_SECRET : ACCESS_TOKEN_SECRET;
	try {
		// Decode the JWT and return the payload
		return jwt.verify(token, secret) as TokenPayload;
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		// Log the error event when verification fails
		logEventsAndPrint(`Failed to decode token (isRefreshToken: ${isRefreshToken}): ${errMsg}. Token: "${token}"`, 'errLog.txt');
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}


export {
	isTokenValid,
};