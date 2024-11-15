
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents.js';
import { accessTokenExpiryMillis, refreshTokenExpiryMillis } from '../../config/config.js';


// Signing Tokens ------------------------------------------------------------------------------------

/**
 * Tokens can be signed with the payload that includes any information we want!
 * We like to use user ID, username and roles.
 */

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
	const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
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
	const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;
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
	if (!userId || !username) logEvents(`Both userId and username are required to generate the token payload!!!!!!!!!!!!!!!!`, 'errLog.txt', { print: true });
	return { user_id: userId, username, roles, allowed_actions: allowedActions };
}



export {
	signAccessToken,
	signRefreshToken,
};