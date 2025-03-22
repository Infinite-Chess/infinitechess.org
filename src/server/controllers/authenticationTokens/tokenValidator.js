
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents.js';
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
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token. Pass `false` for access tokens.
 * @param {string} IP - The IP address they are connecting from.
 * @param {string} [req] - Required if it's a refresh token AND an http request (not socket).
 * @param {string} [res] - Required if it's a refresh token AND an http request (not socket). The response object. If provided, we will renew their refresh token cookie if it's been a bit.
 * @returns {Object} - An object containing the properties: { isValid (boolean), user_id, username, roles }
 */
function isTokenValid(token, isRefreshToken, IP, req, res) {
	if (isRefreshToken === undefined) {
		const reason = "When validating token, you must include the isRefreshToken parameter!";
		logEvents(reason, 'errLog.txt', { print: true });
		return { isValid: false, reason };
	}

	// Extract user ID and username from the token
	// eslint-disable-next-line prefer-const
	let { user_id, username, roles, allowed_actions } = getPayloadContentFromToken(token, isRefreshToken);
	// MAY DELETE THIS LINE AFTER 5 DAYS!! ================================================================================================================
	if (typeof roles === 'string') roles = JSON.parse(roles); // The roles fetched from the database is a stringified json string array, parse it here!
	// ====================================================================================================================================================
	if (user_id === undefined || username === undefined || roles === undefined) return { isValid: false }; // Expired or tampered token

	if (!doesMemberOfIDExist(user_id)) {
		const reason = `Token is valid, but the users account of id "${user_id}" doesn't exist! This is fine, did you just delete it?`;
		console.log(reason);
		if (res) revokeSession(res); // The response may not be defined if we called this method on a websocket upgrade connection request.
		return { isValid: false, reason };
	}

	// If it's an access token, we already know it's valid.
	if (!isRefreshToken) {
		updateLastSeen(user_id);
		return { isValid: true, user_id, username, roles, allowed_actions }; // Access tokens can't be manually invalidated in the database. They need to remain quick.
	}

	// It's a refresh token...

	// Check if the token was manually invalidated (e.g., user logged out)
	if (!doesMemberHaveRefreshToken_RenewSession(user_id, username, roles, token, IP, req, res)) {
		if (res) revokeSession(res); // Revoke their session in case they were manually logged out, and their client didn't know that. The response may not be defined if we called this method on a websocket upgrade connection request.
		return { isValid: false, reason: "User doesn't have a matching refresh token in the database." };
	}

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