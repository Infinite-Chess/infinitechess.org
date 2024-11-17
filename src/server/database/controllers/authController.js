
import bcrypt from 'bcrypt';
import { getTranslationForReq } from "../../utility/translate.js";
import { getMemberDataByCriteria } from "../memberManager.js";
import { getBrowserAgent, onCorrectPassword, onIncorrectPassword, rateLimitLogin } from "./authRatelimiter.js";
import { logEvents } from '../../middleware/logEvents.js';


/**
 * This controller is used to process login form data,
 * returning tru if username and password is correct.
 * 
 * This also rate limits a members login attempts.
 */



/**
 * Called when any fetch request submits login form data.
 * The req body needs to have the `username` and `password` properties.
 * If the req body does not have `username`, req.params must have the `member` property.
 * If the password is correct, this returns true.
 * Otherwise this sends a response to the client saying it was incorrect.
 * This is also rate limited.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {boolean} true if the password was correct
 */
async function testPasswordForRequest(req, res) {
	if (!verifyBodyHasLoginFormData(req, res)) return false; // If false, it will have already sent a response.
    
	// eslint-disable-next-line prefer-const
	let { username: claimedUsername, password: claimedPassword } = req.body;
	claimedUsername = claimedUsername || req.params.member;

	const { user_id, username, hashed_password } = getMemberDataByCriteria(['user_id', 'username', 'hashed_password'], 'username', claimedUsername, { skipErrorLogging: true });
	if (user_id === undefined) { // Username doesn't exist
		res.status(401).json({ 'message': getTranslationForReq("server.javascript.ws-invalid_username", req)}); // Unauthorized, username not found
		return false;
	}
    
	const browserAgent = getBrowserAgent(req, username);
	if (!rateLimitLogin(req, res, browserAgent)) return false; // They are being rate limited from enterring incorrectly too many times

	// Test the password
	const match = await bcrypt.compare(claimedPassword, hashed_password);
	if (!match) {
		logEvents(`Incorrect password for user ${username}!`, "loginAttempts.txt", { print: true });
		res.status(401).json({ 'message': getTranslationForReq("server.javascript.ws-incorrect_password", req )}); // Unauthorized, password not found
		onIncorrectPassword(browserAgent, username);
		return false;
	}

	onCorrectPassword(browserAgent);

	return true;
}

/**
 * Tests if the request body has valid `username` and `password` properties.
 * If not, this auto-sends a response to the client with an error.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {boolean} true if the body is valid
 */
function verifyBodyHasLoginFormData(req, res) {
	if (!req.body) { // Missing body
		console.log(`User sent a bad login request missing the body!`);
		res.status(400).send(getTranslationForReq("server.javascript.ws-bad_request", req)); // 400 Bad request
		return false;
	}

	const { username, password } = req.body;
    
	if (!username || !password) {
		console.log(`User ${username} sent a bad login request missing either username or password!`);
		res.status(400).json({ 'message': getTranslationForReq('server.javascript.ws-username_and_password_required', req) }); // 400 Bad request
		return false;
	}

	if (typeof username !== "string" || typeof password !== "string") {
		console.log(`User ${username} sent a bad login request with either username or password not a string!`);
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_and_password_string", req) }); // 400 Bad request
		return false;
	}

	return true;
}



export {
	testPasswordForRequest,
};