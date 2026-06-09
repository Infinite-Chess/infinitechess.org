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

import { logEvents } from '../middleware/logEvents.js';
import { getMemberDataByCriteria } from '../database/memberManager.js';
import { getScriptTranslationsForReq } from '../config/componentTranslationLoader.js';
import {
	getBrowserAgent,
	onCorrectPassword,
	onIncorrectPassword,
	rateLimitLogin,
} from './authRatelimiter.js';

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
	const { claimedUsername, claimedPassword } = formData;

	// Emails always contain '@' and are stored lowercase; usernames can never contain '@'.
	const isEmail = claimedUsername.includes('@');
	const searchKey = isEmail ? 'email' : 'username';
	const searchValue = isEmail ? claimedUsername.toLowerCase() : claimedUsername;

	// Rate limit keyed on the CLAIMED identifier BEFORE the database lookup, so a real
	// account and a nonexistent one are throttled identically. Otherwise the lockout cooldown
	// would only ever appear for accounts that exist, becoming an enumeration oracle.
	const browserAgent = getBrowserAgent(req, searchValue.toLowerCase());
	if (!rateLimitLogin(req, res, browserAgent)) return undefined; // They are being rate limited from entering incorrectly too many times

	try {
		const record = getMemberDataByCriteria(
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
			logEvents(`Failed login attempt for "${attemptedIdentity}".`, 'loginAttempts.txt');
			res.status(401).json({
				message: getScriptTranslationsForReq('responses', req).auth.invalid_credentials,
			}); // Unauthorized — generic message to avoid account enumeration
			onIncorrectPassword(browserAgent, attemptedIdentity);
			return undefined;
		}

		onCorrectPassword(browserAgent);

		return { user_id: record.user_id, username: record.username, roles: record.roles };
	} catch {
		// DB error (already logged)
		res.status(500).json({
			message: getScriptTranslationsForReq('responses', req).errors.server_error,
		});
		return undefined;
	}
}

/**
 * Tests if the request body has valid `username` and `password` properties.
 * If not, this auto-sends a response to the client with an error.
 * @returns The claimed username and password, or undefined if the body is invalid.
 */
function verifyBodyHasLoginFormData(
	req: Request,
	res: Response,
): { claimedUsername: string; claimedPassword: string } | undefined {
	const { username, password } = req.body;

	if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
		// Unlocalized as this can only be hit from hand-crafted/malformed requests.
		res.status(400).json({ message: 'Request body malformed.' }); // 400 Bad request
		return undefined;
	}

	return { claimedUsername: username, claimedPassword: password };
}

export { testPasswordForRequest };
