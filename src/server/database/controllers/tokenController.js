
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents';

const accessTokenExpiryMillis = 1000 * 60 * 15; // 15 minutes
const refreshTokenExpiryMillis = 1000 * 60 * 60 * 24 * 5; // 5 days
const accessTokenExpirySecs = accessTokenExpiryMillis / 1000;
const refreshTokenExpirySecs = refreshTokenExpiryMillis / 1000;




  
/**
   * Signs and generates both access and refresh tokens for the user.
   * @param {number} userId - The user ID of the member.
   * @param {string} username - The username of the member.
   * @returns {Object} - An object containing `accessToken` and `refreshToken`.
   */
function signTokens(userId, username) {
	const payload = generatePayload(userId, username); // Generate payload using userId and username
	const accessToken = signAccessToken(payload);
	const refreshToken = signRefreshToken(payload);
  
	return { accessToken, refreshToken };
}
  
/**
 * Signs and generates an access token for the user.
 * The access token is short-lived (5-15m) and typically stored in memory.
 * @param {number} userId - The user ID of the member.
 * @param {string} username - The username of the member.
 * @returns {string} - The generated access token.
 */
function signAccessToken(userId, username) {
	const payload = generatePayload(userId, username);
	const accessToken = jwt.sign(
		payload,
		process.env.ACCESS_TOKEN_SECRET,
		{ expiresIn: accessTokenExpirySecs } // Typically short-lived, for in-memory storage only.
	);
	return accessToken;
}
  
/**
   * Signs and generates a refresh token for the user.
   * The refresh token is long-lived (hours-days) and should be stored in an httpOnly cookie (not accessible via JS).
   * @param {number} userId - The user ID of the member.
   * @param {string} username - The username of the member.
   * @returns {string} - The generated refresh token.
   */
function signRefreshToken(userId, username) {
	const payload = generatePayload(userId, username);
	const refreshToken = jwt.sign(
		payload,
		process.env.REFRESH_TOKEN_SECRET,
		{ expiresIn: refreshTokenExpirySecs } // Longer-lived, stored in an httpOnly cookie.
	);
	return refreshToken;
}

/**
 * Generates the payload object for a JWT based on the user ID and username.
 * @param {number} userId - The user ID of the member.
 * @param {string} username - The username of the member.
 * @returns {object} - The payload object containing user information.
 */
function generatePayload(userId, username) {
	if (!userId || !username) logEvents(`Both userId and username are required to generate the token payload!!!!!!!!!!!!!!!!`, 'errLog.txt', { print: true });
	
	return {
	  user_id: userId,
	  username: username,
	};
}
  


export {
	refreshTokenExpiryMillis,
	signTokens,
	signAccessToken,
};