
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents';
import { doesMemberHaveRefreshToken } from './refreshTokenController';



// Variable ---------------------------------------------------------------------------------



const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes
const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;



// Validating Tokens ---------------------------------------------------------------------------------



/**
 * Checks if a token is valid.
 * This checks the following conditions:
 * 1. If the token has expired or has been tampered with (payload won't have required properties).
 * 2. If the token is manually invalidated, such as when a user logs out, or deletes their account, and the token was removed from their information in the members table.
 * @param {string} token - The token to validate.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token. Pass `false` for access tokens.
 * @returns {Object} - An object containing the properties: { isValid (boolean), user_id, username, roles }
 */
function isTokenValid(token, isRefreshToken) {
	// Extract user ID and username from the token
	const { user_id, username, roles, allowed_actions } = getPayloadContentFromToken(token, isRefreshToken);
	if (user_id === undefined) return { isValid: false }; // Expired or tampered token

	if (!isRefreshToken) return { isValid: true }; // Access tokens can't be manually invalidated in the database. They need to remain quick.

	// Check if the token was manually invalidated (e.g., user logged out)
	if (!doesMemberHaveRefreshToken(user_id, token, isRefreshToken)) return { isValid: false };

	// If all checks pass, return a success response with the decoded payload information, such as their user_id and username
	return { isValid: true, user_id, username, roles, allowed_actions };
}

/**
 * Retrieves the user ID and username from a token.
 * This does NOT check if the token was manually invalidated (e.g., user logged out early).
 * @param {string} token - The access or refresh token to decode.
 * @param {boolean} isRefreshToken - Indicates whether the token is a refresh token (false if access token).
 * @returns {object} - An object: { user_id, username } if the token is valid, or an empty object {} if the token is invalid, or expired, NOT IF WE MANUALLY INVALIDATED IT.
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
		logEvents(`Failed to verify token (isRefreshToken: ${isRefreshToken}): ${err.message}`, 'errLog.txt', { print: true });
		// Return undefined if verification fails (e.g., token is invalid or expired)
		return undefined;
	}
}



// Signing Tokens ------------------------------------------------------------------------------------

  

/**
 * Signs and generates an access token for the user.
 * The access token is short-lived (5-15m) and typically stored in memory.
 * @param {number} userId - The user ID of the member.
 * @param {string} username - The username of the member.
 * @param {string[]} roles - The roles of the member (e.g. ['patron'])
 * @param {string[]} allowedActions - Actions they are allowed to perform using this access token (e.g. ['open-socket'])
 * @returns {string} - The generated access token.
 */
function signAccessToken(userId, username, roles, allowedActions) {
	const payload = generatePayload(userId, username, roles, allowedActions);
	return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: accessTokenExpirySecs }); // Typically short-lived, for in-memory storage only.
}
  
/**
 * Signs and generates a refresh token for the user.
 * The refresh token is long-lived (hours-days) and should be stored in an httpOnly cookie (not accessible via JS).
 * @param {number} userId - The user ID of the member.
 * @param {string} username - The username of the member.
 * @param {string[]} roles - The roles of the member (e.g. ['patron'])
 * @returns {string} - The generated refresh token.
 */
function signRefreshToken(userId, username, roles) {
	const payload = generatePayload(userId, username, roles);
	return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: refreshTokenExpirySecs }); // Longer-lived, stored in an httpOnly cookie.
}

/**
 * Generates the payload object for a JWT based on the user ID and username.
 * @param {number} userId - The user ID of the member.
 * @param {string} username - The username of the member.
 * @param {string[]} roles - The roles of the member (e.g. ['patron'])
 * @param {string[]} [allowedActions] Provide if it's an access token - Actions they are allowed to perform using this access token (e.g. ['open-socket'])
 * @returns {object} - The payload object containing user information.
 */
function generatePayload(userId, username, roles, allowedActions) {
	if (!userId || !username || !roles) logEvents(`Both userId and username are required to generate the token payload!!!!!!!!!!!!!!!!`, 'errLog.txt', { print: true });
	return { user_id: userId, username, roles, allowed_actions: allowedActions };
}



export {
	isTokenValid,
	signAccessToken,
	signRefreshToken,
	
};