
import jwt from 'jsonwebtoken';
import { logEvents } from '../../middleware/logEvents';

/**
 * How long until the cookie containing their new access token
 * will last until expiring, in milliseconds.
 * This is NOT when the token itself expires, only the cookie.
 */
const expireTimeOfTokenCookieMillis = 1000 * 10; // 10 seconds



/**
 * Creates and sets an HTTP-only cookie containing the refresh token.
 * @param {Object} res - The response object.
 * @param {string} accessToken - The access token to be stored in the cookie.
 */
function createAccessTokenCookie(res, accessToken) {
	// Cross-site usage requires we set sameSite to none! Also requires secure (https) true
	res.cookie('token', accessToken, { sameSite: 'None', secure: true, maxAge: expireTimeOfTokenCookieMillis }); // 10 second time limit. JavaScript needs to read it in that time!.
}



export {
	createAccessTokenCookie,
};