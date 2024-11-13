
/**
 * This controller is used when a client submits login form data.
 * 
 * This rate limits a members login attempts,
 * and when they successfully login:
 * 
 * This generates an access token, and a refresh cookie for them,
 * and updates basic variables in their profile after logging in.
 */

import bcrypt from 'bcrypt';
import { getMemberDataByCriteria, updateLoginCountAndLastSeen } from './memberController.js';
import { logEvents } from '../../middleware/logEvents.js';
import { signRefreshToken } from './tokenController.js';
import { addRefreshTokenToMemberData, createLoginCookies } from './refreshTokenController.js';
import { getTranslationForReq } from '../../utility/translate.js';
import { getClientIP } from '../../middleware/IP.js';


// Rate limiting stuff...

/** Maximum consecutive login attempts allowed for each username-IP
 * combination before they will be locked out temporarily. */
const maxLoginAttempts = 3;
/** The amount of time the cooldown is incremented by, after failing by {@link maxLoginAttempts} *again*... */
const loginCooldownIncrementorSecs = 5;
/**
 * A hash that stores login attempts for each ip and user.
 * `{
 *  "username_IP": {
*      attempts: 0,
*      cooldownTimeSecs: 0,
*      lastAttemptTime: 0,
       deleteTimeoutID,
 *  }
 * }`
 */
const loginAttemptData = {};
/** The time, in milliseconds, to delete a browser agent from the
 * login attempt data, if they have stopped trying to login. */
const timeToDeleteBrowserAgentAfterNoAttemptsMillis = 1000 * 60 * 5; // 5 minutes

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

	// The payload can be an object with their username and their roles.
	const refreshToken = signRefreshToken(user_id, username, roles);
    
	// Save the refresh token with current user so later when they log out we can invalidate it.
	addRefreshTokenToMemberData(user_id, refreshToken, ); // false for access token
    
	createLoginCookies(res, user_id, username, refreshToken);

	res.status(200).json({ message: "Logged in! Issued refresh token cookie and member info cookie." }); // Success!
    
	// Update our member's statistics in their data file!
	updateLoginCountAndLastSeen(user_id);
    
	logEvents(`Logged in member "${username}".`, "loginAttempts.txt", { print: true });
}

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

// Rate limiting stuff...

/**
 * Prevents a user-IP combination from entering login attempts too fast.
 * @returns {boolean} true if the attempt is allowed
 */
function rateLimitLogin(req, res, browserAgent) {
	const now = new Date();
	loginAttemptData[browserAgent] = loginAttemptData[browserAgent] || {
		attempts: 0,
		cooldownTimeSecs: 0,
		lastAttemptTime: now
	};
    
	const timeSinceLastAttemptsSecs = (now - loginAttemptData[browserAgent].lastAttemptTime) / 1000;

	if (loginAttemptData[browserAgent].attempts < maxLoginAttempts) {
		incrementBrowserAgentLoginAttemptCounter(browserAgent, now);
		return true; // Attempt allowed
	}

	// Too many attempts!

	if (timeSinceLastAttemptsSecs <= loginAttemptData[browserAgent].cooldownTimeSecs) { // Still on cooldown

		let translation = getTranslationForReq('server.javascript.ws-login_failure_retry_in', req);
		const login_cooldown = Math.floor(loginAttemptData[browserAgent].cooldownTimeSecs - timeSinceLastAttemptsSecs);
		const seconds_plurality = login_cooldown === 1 ? getTranslationForReq("server.javascript.ws-second", req) : getTranslationForReq("server.javascript.ws-seconds", req);
		translation += ` ${login_cooldown} ${seconds_plurality}.`;

		res.status(401).json({ 'message': translation }); // "Failed to log in, try again in 3 seconds.""
        
		// Reset the timer to auto-delete them from the login attempt data
		// if they haven't tried in a while.
		// This is so it doesn't get cluttered over time
		// as more and more people try to login and fail.
		resetTimerToDeleteBrowserAgent(browserAgent);
		return false; // Attempt not allowed
	}

	// No longer on cooldown
	resetBrowserAgentLoginAttemptCounter(browserAgent);
	incrementBrowserAgentLoginAttemptCounter(browserAgent, now);
	return true; // Attempt allowed
}

/**
 * Generates a unique browser agent string using the request object and username.
 * @param {Object} req - The request object.
 * @param {string} username - The username.
 * @returns {string} - The browser agent string, `${usernameLowercase}${clientIP}`
 */
function getBrowserAgent(req, username) {
	const clientIP = getClientIP(req);
	return `${username}${clientIP}`;
}

/**
 * Increments the login attempt counter in the login attempt data for a browser agent.
 * @param {string} browserAgent - The browser agent string.
 * @param {Date} now - The current date and time.
 */
function incrementBrowserAgentLoginAttemptCounter(browserAgent, now) {
	loginAttemptData[browserAgent].attempts += 1;
	loginAttemptData[browserAgent].lastAttemptTime = now;
	// Reset the timer to auto-delete them from the login attempt data
	// if they haven't tried in a while.
	// This is so it doesn't get cluttered over time
	// as more and more people try to login and fail.
	resetTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Resets the login attempt counter in the login attempt data for a browser agent.
 * @param {string} browserAgent - The browser agent string.
 */
function resetBrowserAgentLoginAttemptCounter(browserAgent) {
	loginAttemptData[browserAgent].attempts = 0;
}

/**
 * Resets the timer to delete a browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function resetTimerToDeleteBrowserAgent(browserAgent) {
	cancelTimerToDeleteBrowserAgent(browserAgent);
	startTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Cancels the timer to delete a browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function cancelTimerToDeleteBrowserAgent(browserAgent) {
	clearTimeout(loginAttemptData[browserAgent]?.deleteTimeoutID);
	delete loginAttemptData[browserAgent]?.deleteTimeoutID;
}

/**
 * Starts the timer that will delete a browser agent from the login attempt data
 * after they have given up on trying passwords.
 * @param {string} browserAgent - The browser agent string.
 */
function startTimerToDeleteBrowserAgent(browserAgent) {
	loginAttemptData[browserAgent].deleteTimeoutID = setTimeout(() => {
		delete loginAttemptData[browserAgent];
		console.log(`Allowing browser agent "${browserAgent}" to login without cooldown again!`);
	}, timeToDeleteBrowserAgentAfterNoAttemptsMillis);
}

/**
 * Handles the rate limiting scenario when an incorrect password is entered.
 * Temporarily locks them out if they've entered too many incorrect passwords.
 * @param {string} browserAgent - The browser agent string.
 * @param {string} username - The username.
 */
function onIncorrectPassword(browserAgent, username) {
	if (loginAttemptData[browserAgent].attempts < maxLoginAttempts) return; // Don't lock them yet
	// Lock them!
	loginAttemptData[browserAgent].cooldownTimeSecs += loginCooldownIncrementorSecs;
	logEvents(`${username} got login locked for ${loginAttemptData[browserAgent].cooldownTimeSecs} seconds`, "loginAttempts.txt", { print: true });
}

/**
 * Handles the rate limiting scenario when a correct password is entered.
 * Deletes their browser agent from the login attempt data.
 * @param {string} browserAgent - The browser agent string.
 */
function onCorrectPassword(browserAgent) {
	cancelTimerToDeleteBrowserAgent(browserAgent);
	// Delete now
	delete loginAttemptData[browserAgent];
}

export {
	handleLogin,
	testPasswordForRequest,
};
