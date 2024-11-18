
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents.js';
import { doesMemberOfIDExist, updateLastSeen } from '../../database/memberManager.js';
import { doStuffOnLogout } from '../../database/controllers/logoutController.js';
import { doesMemberHaveRefreshToken_RenewSession } from './sessionManager.js';

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
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token. Pass `false` for access tokens.
 * @param {string} res - The response object. If provided, we will renew their refresh token cookie if it's been a bit.
 * @returns {Object} - An object containing the properties: { isValid (boolean), user_id, username, roles }
 */
function isTokenValid(token, isRefreshToken, req, res) {
	if (isRefreshToken === undefined) {
		logEvents("When validating token, you must include the isRefreshToken parameter!", 'errLog.txt', { print: true });
		return { isValid: false };
	}

	// Extract user ID and username from the token
	const { user_id, username, roles, allowed_actions } = getPayloadContentFromToken(token, isRefreshToken);
	if (user_id === undefined || username === undefined || roles === undefined) return { isValid: false }; // Expired or tampered token

	if (!doesMemberOfIDExist(user_id)) {
		// console.log(`Token is valid, but the users account of id "${user_id}" doesn't exist!`);
		logEvents(`Token is valid, but the users account of id "${user_id}" doesn't exist! This is fine, did you just delete it?`, 'errLog.txt', { print: true });
		doStuffOnLogout(res, user_id, username);
		return { isValid: false };
	}

	// If it's an access token, we already know it's valid.
	if (!isRefreshToken) {
		updateLastSeen(user_id);
		return { isValid: true, user_id, username, roles, allowed_actions }; // Access tokens can't be manually invalidated in the database. They need to remain quick.
	}

	// It's a refresh token...

	// Check if the token was manually invalidated (e.g., user logged out)
	if (!doesMemberHaveRefreshToken_RenewSession(user_id, username, roles, token, req, res)) return { isValid: false };

	// If all checks pass, return a success response with the decoded payload information, such as their user_id and username
	updateLastSeen(user_id);
	return { isValid: true, user_id, username, roles, allowed_actions };
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
		logEvents(`Failed to verify token (isRefreshToken: ${isRefreshToken}): ${err.message}. Token: "${token}"`, 'errLog.txt', { print: true });
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}


export {
	isTokenValid,
};