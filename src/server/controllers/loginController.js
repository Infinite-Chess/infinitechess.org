
/**
 * This controller is used when a client logs in.
 * 
 * This rate limits a members login attempts,
 * and when they successfully login:
 * 
 * Creates a new login session,
 * and updates last_seen and login_count in their profile.
 */

import { getMemberDataByCriteria, updateLoginCountAndLastSeen } from '../database/memberManager.js';
import { logEvents } from '../middleware/logEvents.js';
import { createNewSession } from './authenticationTokens/sessionManager.js';
import { testPasswordForRequest } from './authController.js';



/**
 * Called when the login page submits login form data.
 * Tests their username and password. If correct, it logs
 * them in, generates tokens for them, and updates their member variables.
 * THIS SHOULD ALWAYS send a json response, because the errors we send are displayed on the page.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
async function handleLogin(req, res) {
	if (!(await testPasswordForRequest(req, res))) return; // Incorrect password, it will have already sent a response.
	// Correct password...

	const usernameCaseInsensitive = req.body.username; // We already know this property is present on the request

	const { user_id, username, roles } = getMemberDataByCriteria(['user_id', 'username', 'roles'], 'username', usernameCaseInsensitive);
	if (user_id === undefined) return logEvents(`User "${usernameCaseInsensitive}" not found after a successful login! This should never happen.`, 'errLog.txt', { print: true });

	createNewSession(req, res, user_id, username, roles);

	res.status(200).json({ message: "Logged in! Issued refresh token cookie and member info cookie." }); // Success!
    
	// Update our member's statistics in their data file!
	updateLoginCountAndLastSeen(user_id);
    
	logEvents(`Logged in member "${username}".`, "loginAttempts.txt", { print: true });
}



export {
	handleLogin,
};
