// src/server/controllers/authController.ts

/**
 * This controller is used to process login form data,
 * returning true if username/email and password is correct.
 *
 * This also rate limits a members login attempts.
 */

import type { Request, Response } from 'express';
import type { MemberRecord } from '../database/memberManager.js';

import bcrypt from 'bcrypt';

import validators from '../../shared/util/validators.js';

import logEvents from '../utility/logEvents.js';
import memberManager from '../database/memberManager.js';
import authRatelimiter from './authRatelimiter.js';

/**
 * Called when any fetch request submits login form data.
 * The req body needs to have the `username` and `password` properties.
 * The `username` may be either a username or an email.
 * If the password is correct, this returns the resolved identity of the member.
 * Otherwise this sends a response to the client saying it was incorrect, and returns undefined.
 * This is also rate limited.
 * @returns the resolved member identity if the password was correct, otherwise undefined
 */
async function testPasswordForRequest(
	req: Request,
	res: Response,
): Promise<Pick<MemberRecord, 'user_id' | 'username' | 'roles'> | undefined> {
	const formData = verifyBodyHasLoginFormData(req, res);
	if (!formData) return undefined; // Reponse already sent

	const { claimedIdentifier, isEmail, claimedPassword } = formData;

	const searchKey = isEmail ? 'email' : 'username';
	// Lowercased here (not by the data layer): memberManager.getDataByCriteria is column-agnostic, so an
	// email search value must be normalized by the caller to match the stored lowercase emails.
	const searchValue = isEmail ? claimedIdentifier.toLowerCase() : claimedIdentifier;

	// Rate limit keyed on the CLAIMED identifier BEFORE the database lookup, so a real
	// account and a nonexistent one are throttled identically. Otherwise the lockout cooldown
	// would only ever appear for accounts that exist, becoming an enumeration oracle.
	const browserAgent = authRatelimiter.getBrowserAgent(req, searchValue.toLowerCase());
	if (!authRatelimiter.limitLogin(req, res, browserAgent)) return undefined; // They are being rate limited from entering incorrectly too many times

	try {
		const record = memberManager.getDataByCriteria(
			['user_id', 'username', 'hashed_password', 'roles'],
			searchKey,
			searchValue,
		);

		// Only test the password if the account exists, but ALWAYS respond with the same generic
		// message, so the response never reveals whether the identifier is registered.
		const match =
			record !== undefined && (await bcrypt.compare(claimedPassword, record.hashed_password));
		if (!match) {
			const attemptedIdentity = record?.username ?? searchValue;
			logEvents.add(`Failed login attempt for "${attemptedIdentity}".`, 'loginAttempts');
			res.status(401).json({
				message: req.t.responses.auth.invalid_credentials,
			}); // Unauthorized — generic message to avoid account enumeration
			authRatelimiter.onIncorrectPassword(browserAgent, attemptedIdentity);
			return undefined;
		}

		authRatelimiter.onCorrectPassword(browserAgent);

		return { user_id: record.user_id, username: record.username, roles: record.roles };
	} catch {
		// DB error (already logged)
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
		return undefined;
	}
}

/**
 * Tests if the request body has valid `username` and `password` properties,
 * the identifier being shaped like something that could actually be registered.
 * If not, this auto-sends a response to the client with an error.
 * @returns The claimed identifier and password, plus whether the identifier is an
 * email, or undefined if the body is invalid.
 */
function verifyBodyHasLoginFormData(
	req: Request,
	res: Response,
): { claimedIdentifier: string; isEmail: boolean; claimedPassword: string } | undefined {
	const { username, password } = req.body;

	if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
		// Unlocalized as this can only be hit from hand-crafted/malformed requests.
		res.status(400).json({ message: 'Request body malformed.' });
		return undefined;
	}

	// Emails always contain '@' and are stored lowercase; usernames can never contain '@'.
	const isEmail = username.includes('@');

	// An identifier failing the register form's rules can never match an account. Rejecting
	// it here keeps unbounded, arbitrary text out of the rate limiter's keys and the logs.
	if (!isIdentifierShapeValid(username, isEmail)) {
		res.status(401).json({
			// The same generic message a wrong password gets, so it can't be told apart.
			message: req.t.responses.auth.invalid_credentials,
		});
		return undefined;
	}

	return { claimedIdentifier: username, isEmail, claimedPassword: password };
}

/** Whether the claimed identifier could be a registered email or username. */
function isIdentifierShapeValid(identifier: string, isEmail: boolean): boolean {
	return isEmail
		? validators.validateEmail(identifier) === validators.EmailValidationResult.Ok
		: validators.validateUsername(identifier) === validators.UsernameValidationResult.Ok;
}

// Exports ---------------------------------------------------------------------

export default { testPasswordForRequest };
