// src/server/controllers/authRatelimiter.ts

/**
 * The script rate limits login/authentication attempts by a combination of username and IP address
 */

import type { Request, Response } from 'express';

import { getClientIP } from '../utility/IP.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
// @ts-ignore
import { getTranslationForReq } from '../utility/translate.js';

// Types ----------------------------------------------------------------------------

type LoginAttemptData = {
	attempts: number;
	cooldownTimeSecs: number;
	lastAttemptTime: Date;
	deleteTimeoutID?: NodeJS.Timeout;
};

// Variables ----------------------------------------------------------------------------

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
const loginAttemptData: Record<string, LoginAttemptData> = {};
/**
 * The time, in milliseconds, to delete a browser agent from the
 * login attempt data, if they have stopped trying to login.
 */
const timeToDeleteBrowserAgentAfterNoAttemptsMillis = 1000 * 60 * 5; // 5 minutes

// Functions ----------------------------------------------------------------------------

/**
 * Prevents a user-IP combination from entering login attempts too fast.
 * @returns true if the attempt is allowed
 */
function rateLimitLogin(req: Request, res: Response, browserAgent: string): boolean {
	const now = new Date();
	loginAttemptData[browserAgent] = loginAttemptData[browserAgent] || {
		attempts: 0,
		cooldownTimeSecs: 0,
		lastAttemptTime: now,
	};

	const timeSinceLastAttemptsSecs =
		(now.getTime() - loginAttemptData[browserAgent].lastAttemptTime.getTime()) / 1000;

	if (loginAttemptData[browserAgent].attempts < maxLoginAttempts) {
		incrementBrowserAgentLoginAttemptCounter(browserAgent, now);
		return true; // Attempt allowed
	}

	// Too many attempts!

	if (timeSinceLastAttemptsSecs <= loginAttemptData[browserAgent].cooldownTimeSecs) {
		// Still on cooldown

		let translation = getTranslationForReq('server.javascript.ws-login_failure_retry_in', req);
		const login_cooldown = Math.floor(
			loginAttemptData[browserAgent].cooldownTimeSecs - timeSinceLastAttemptsSecs,
		);
		const seconds_plurality =
			login_cooldown === 1
				? getTranslationForReq('server.javascript.ws-second', req)
				: getTranslationForReq('server.javascript.ws-seconds', req);
		translation += ` ${login_cooldown} ${seconds_plurality}.`;

		res.status(401).json({ message: translation }); // "Failed to log in, try again in 3 seconds.""

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
 * @param req - The request object.
 * @param username - The username.
 * @returns The browser agent string, `${usernameLowercase}${clientIP}`
 */
function getBrowserAgent(req: Request, username: string): string {
	const clientIP = getClientIP(req);
	return `${username}${clientIP}`;
}

/**
 * Increments the login attempt counter in the login attempt data for a browser agent.
 * @param browserAgent - The browser agent string.
 * @param now - The current date and time.
 */
function incrementBrowserAgentLoginAttemptCounter(browserAgent: string, now: Date): void {
	loginAttemptData[browserAgent]!.attempts += 1;
	loginAttemptData[browserAgent]!.lastAttemptTime = now;
	// Reset the timer to auto-delete them from the login attempt data
	// if they haven't tried in a while.
	// This is so it doesn't get cluttered over time
	// as more and more people try to login and fail.
	resetTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Resets the login attempt counter in the login attempt data for a browser agent.
 * @param browserAgent - The browser agent string.
 */
function resetBrowserAgentLoginAttemptCounter(browserAgent: string): void {
	loginAttemptData[browserAgent]!.attempts = 0;
}

/**
 * Resets the timer to delete a browser agent from the login attempt data.
 * @param browserAgent - The browser agent string.
 */
function resetTimerToDeleteBrowserAgent(browserAgent: string): void {
	cancelTimerToDeleteBrowserAgent(browserAgent);
	startTimerToDeleteBrowserAgent(browserAgent);
}

/**
 * Cancels the timer to delete a browser agent from the login attempt data.
 * @param browserAgent - The browser agent string.
 */
function cancelTimerToDeleteBrowserAgent(browserAgent: string): void {
	clearTimeout(loginAttemptData[browserAgent]?.deleteTimeoutID);
	delete loginAttemptData[browserAgent]?.deleteTimeoutID;
}

/**
 * Starts the timer that will delete a browser agent from the login attempt data
 * after they have given up on trying passwords.
 * @param browserAgent - The browser agent string.
 */
function startTimerToDeleteBrowserAgent(browserAgent: string): void {
	loginAttemptData[browserAgent]!.deleteTimeoutID = setTimeout(() => {
		delete loginAttemptData[browserAgent];
		console.log(`Allowing browser agent "${browserAgent}" to login without cooldown again!`);
	}, timeToDeleteBrowserAgentAfterNoAttemptsMillis);
}

/**
 * Handles the rate limiting scenario when an incorrect password is entered.
 * Temporarily locks them out if they've entered too many incorrect passwords.
 * @param browserAgent - The browser agent string.
 * @param username - The username.
 */
function onIncorrectPassword(browserAgent: string, username: string): void {
	if (loginAttemptData[browserAgent]!.attempts < maxLoginAttempts) return; // Don't lock them yet
	// Lock them!
	loginAttemptData[browserAgent]!.cooldownTimeSecs += loginCooldownIncrementorSecs;
	logEventsAndPrint(
		`${username} got login locked for ${loginAttemptData[browserAgent]!.cooldownTimeSecs} seconds`,
		'loginAttempts.txt',
	);
}

/**
 * Handles the rate limiting scenario when a correct password is entered.
 * Deletes their browser agent from the login attempt data.
 * @param browserAgent - The browser agent string.
 */
function onCorrectPassword(browserAgent: string): void {
	cancelTimerToDeleteBrowserAgent(browserAgent);
	// Delete now
	delete loginAttemptData[browserAgent];
}

export { rateLimitLogin, onCorrectPassword, onIncorrectPassword, getBrowserAgent };
