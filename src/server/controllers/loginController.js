
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
import { logEventsAndPrint } from '../middleware/logEvents.js';
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
	// Initial check - if this fails, it sends a response and returns.
	if (!(await testPasswordForRequest(req, res))) return; 
	// Correct password...

	try {
		const usernameCaseInsensitive = req.body.username; // We already know this property is present on the request

		const { user_id, username, roles } = getMemberDataByCriteria(['user_id', 'username', 'roles'], 'username', usernameCaseInsensitive);
		
		if (user_id === undefined) {
			// This is a critical internal inconsistency.
			logEventsAndPrint(`User "${usernameCaseInsensitive}" not found by username after a successful password check! This indicates a data integrity issue.`, 'errLog.txt');
			// Send a generic error to the client, as this is a server-side problem.
			return res.status(500).json({ message: "Login failed due to an internal server error. Please try again later." });
		}

		// The roles fetched from the database is a stringified json string array, parse it here!
		const parsedRoles = roles !== null ? JSON.parse(roles) : null;

		createNewSession(req, res, user_id, username, parsedRoles);

		res.status(200).json({ message: "Logged in successfully." });
		
		// These operations are "fire and forget" in terms of the client response
		updateLoginCountAndLastSeen(user_id); 
		logEventsAndPrint(`Logged in member "${username}".`, "loginAttempts.txt");

	} catch (error) {
		// Log the detailed error for server-side debugging.
		logEventsAndPrint(`Error during handleLogin for user "${req.body.username}": ${error.message}\n${error.stack}`, 'errLog.txt');
		
		// Send a generic error response to the client.
		// Avoid sending detailed error messages to the client for security reasons.
		// Check if a response has already been sent to avoid "Error [ERR_HTTP_HEADERS_SENT]"
		if (!res.headersSent) {
			res.status(500).json({ message: "Login failed due to an unexpected error. Please try again." });
		}
	}
}

export {
	handleLogin,
};
