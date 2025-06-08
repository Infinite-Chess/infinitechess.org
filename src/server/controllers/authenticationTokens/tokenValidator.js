
import jwt from 'jsonwebtoken';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { doesMemberOfIDExist, updateLastSeen } from '../../database/memberManager.js';
import { doesMemberHaveRefreshToken_RenewSession, revokeSession } from './sessionManager.js';

/**
 * This script tests provided tokens for validation,
 * returning the decoded user information if they are,
 * renews their session if possible,
 * and updates their last_seen property in the database.
 */


// Validating Tokens ---------------------------------------------------------------------------------


/**
 * Checks if a token is valid.
 * This checks the following conditions:
 * 1. If the token has expired or has been tampered with (payload won't have required properties).
 * 2. If the token is manually invalidated, such as when a user logs out, or deletes their account, and the token was removed from their information in the members table.
 * @param {string} token - The token to validate.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token.
 * @param {string} IP - The IP address they are connecting from.
 * @param {import('express').Request} [req] - The request object, if applicable.
 * @param {import('express').Response} [res] - The response object, if applicable.
 * @returns {Object} - An object: { isValid (boolean), user_id, username, roles, reason? }
 */
function isTokenValid(token, isRefreshToken, IP, req, res) {
	try {
		if (isRefreshToken === undefined) {
			const reason = "isTokenValid requires the isRefreshToken parameter.";
			logEventsAndPrint(reason, 'errLog.txt');
			return { isValid: false, reason };
		}

		// 1. Decode the token first
		const { user_id, username, roles, allowed_actions } = getPayloadContentFromToken(token, isRefreshToken);

		console.log("IS ROLES TYPEOF OBJECT?", typeof roles);

		if (user_id === undefined || username === undefined || roles === undefined) {
			return { isValid: false, reason: "Token is expired or tampered." };
		}
		

		// 2. If it's an access token, check if the user account still exists.
		if (!isRefreshToken) {
			if (!doesMemberOfIDExist(user_id)) {
				console.log(`Token is for a deleted user account (ID: ${user_id}).`);
				if (res) revokeSession(res); // The response may not be defined if we called this method on a websocket upgrade connection request.
				return { isValid: false, reason: "User account does not exist." };
			}

			// Validation complete for access token.

			updateLastSeen(user_id);
			return { isValid: true, user_id, username, roles, allowed_actions };
		}

		// 3. For a refresh token, check against the database.
		// This is the main database-dependent part.
		const isStoredInDb = doesMemberHaveRefreshToken_RenewSession(user_id, username, roles, token, IP, req, res);
		if (!isStoredInDb) {
			if (res) revokeSession(res); // Revoke their session in case they were manually logged out, and their client didn't know that. The response may not be defined if we called this method on a websocket upgrade connection request.
			return { isValid: false, reason: "Refresh token not found in the database." };
		}

		// 4. If all checks pass, the token is valid.
		updateLastSeen(user_id);
		return { isValid: true, user_id, username, roles, allowed_actions };

	} catch (error) {
		// This block will catch any unexpected errors from database calls
		logEventsAndPrint(`A critical error occurred during token validation: ${error.message}`, 'errLog.txt');
		
		// Return a predictable "invalid" response. The caller does not need to crash.
		return { isValid: false, reason: "An internal error occurred during validation." };
	}
}

/**
 * Retrieves the user ID and username from a token.
 * This does NOT check if the token was manually invalidated (e.g., user logged out early).
 * @param {string} token - The access or refresh token to decode.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token (false if access token).
 * @returns {object} - An object: { user_id, username, roles, allowed_actions } if the token is valid, or an empty object {} if the token is invalid, or expired, NOT IF WE MANUALLY INVALIDATED IT.
 */
function getPayloadContentFromToken(token, isRefreshToken) {
	const payload = getTokenPayload(token, isRefreshToken);
	// If the token is invalid or expired, return null
	if (!payload) return {};
	// Extract user ID and username from the payload
	const { username, user_id, roles, allowed_actions } = payload;
	// Return the user ID and username
	return { user_id, username, roles, allowed_actions };
}

/**
 * Extracts and decodes the payload from an access or refresh token.
 * @param {string} token - The token (access or refresh) to decode.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token (false if access token).
 * @returns {object|undefined} - The decoded payload (e.g., { user_id, username }) if valid, or undefined if the token is invalid or expired.
 */
function getTokenPayload(token, isRefreshToken) {
	const secret = isRefreshToken ? process.env.REFRESH_TOKEN_SECRET : process.env.ACCESS_TOKEN_SECRET;
	try {
		// Decode the JWT and return the payload
		return jwt.verify(token, secret);
	} catch (err) {
		// Log the error event when verification fails
		logEventsAndPrint(`Failed to verify token (isRefreshToken: ${isRefreshToken}): ${err.message}. Token: "${token}"`, 'errLog.txt');
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}


export {
	isTokenValid,
};