// src/server/controllers/logincontroller.ts

/**
 * This controller is used when a client logs in.
 *
 * This rate limits a members login attempts,
 * and when they successfully login:
 *
 * Creates a new login session,
 * and updates last_seen and login_count in their profile.
 */

import type { Request, Response } from 'express';

import { createNewSession } from './authenticationTokens/sessionmanager.js';
import { logEventsAndPrint } from '../middleware/logevents.js';
import { testPasswordForRequest } from './authcontroller.js';
import { getMemberDataByCriteria, updateLoginCountAndLastSeen } from '../database/membermanager.js';

/**
 * Called when the login page submits login form data.
 * Tests their username and password. If correct, it logs
 * them in, generates tokens for them, and updates their member variables.
 * THIS SHOULD ALWAYS send a json response, because the errors we send are displayed on the page.
 */
async function handleLogin(req: Request, res: Response): Promise<void> {
	// Initial check - if this fails, it sends a response and returns.
	if (!(await testPasswordForRequest(req, res))) return;
	// Correct password...

	try {
		const usernameCaseInsensitive = req.body.username; // We already know this property is present on the request

		const record = getMemberDataByCriteria(
			['user_id', 'username', 'roles'],
			'username',
			usernameCaseInsensitive,
		);

		if (record === undefined) {
			// This is a critical internal inconsistency.
			logEventsAndPrint(
				`User "${usernameCaseInsensitive}" not found by username after a successful password check! This indicates a data integrity issue.`,
				'errLog.txt',
			);
			// Send a generic error to the client, as this is a server-side problem.
			res.status(500).json({
				message: 'Login failed due to an internal server error. Please try again later.',
			});
			return;
		}

		// The roles fetched from the database is a stringified json string array, parse it here!
		const parsedRoles = record.roles !== null ? JSON.parse(record.roles) : null;

		createNewSession(req, res, record.user_id, record.username, parsedRoles);

		res.status(200).json({ message: 'Logged in successfully.' });

		// These operations are "fire and forget" in terms of the client response
		updateLoginCountAndLastSeen(record.user_id);
		logEventsAndPrint(`Logged in member "${record.username}".`, 'loginAttempts.txt');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// Log the detailed error for server-side debugging.
		logEventsAndPrint(
			`Error during handleLogin for user "${req.body.username}": ${message}`,
			'errLog.txt',
		);

		// Send a generic error response to the client.
		// Avoid sending detailed error messages to the client for security reasons.
		// Check if a response has already been sent to avoid "Error [ERR_HTTP_HEADERS_SENT]"
		if (!res.headersSent) {
			res.status(500).json({
				message: 'Login failed due to an unexpected error. Please try again.',
			});
		}
	}
}

export { handleLogin };
