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
 * If the req body does not have `username`, req.params must have the `member` property.
 * If the password is correct, this returns the resolved identity of the member.
 * Otherwise this sends a response to the client saying it was incorrect, and returns undefined.
 * This is also rate limited.
 * @returns the resolved member identity if the password was correct, otherwise undefined
 */
async function testPasswordForRequest(
	req: Request,
	res: Response,
): Promise<Pick<MemberRecord, 'user_id' | 'username' | 'roles'> | undefined> {
	if (!verifyBodyHasLoginFormData(req, res)) return undefined; // If undefined, it will have already sent a response.

	// eslint-disable-next-line prefer-const
	let { username: claimedUsername, password: claimedPassword } = req.body;
	claimedUsername = claimedUsername || req.params['member'];

	// Emails always contain '@' and are stored lowercase; usernames can never contain '@'.
	const isEmail = claimedUsername.includes('@');
	const searchKey = isEmail ? 'email' : 'username';
	const searchValue = isEmail ? claimedUsername.toLowerCase() : claimedUsername;

	const record = getMemberDataByCriteria(
		['user_id', 'username', 'hashed_password', 'roles'],
		searchKey,
		searchValue,
	);
	if (record === undefined) {
		// User not found
		res.status(401).json({
			message: getScriptTranslationsForReq('responses', req).auth.invalid_identifier,
		}); // Unauthorized, username not found
		return undefined;
	}

	const browserAgent = getBrowserAgent(req, record.username);
	if (!rateLimitLogin(req, res, browserAgent)) return undefined; // They are being rate limited from enterring incorrectly too many times

	// Test the password
	const match = await bcrypt.compare(claimedPassword, record.hashed_password);
	if (!match) {
		logEvents(`Incorrect password for user ${record.username}!`, 'loginAttempts.txt');
		res.status(401).json({
			message: getScriptTranslationsForReq('responses', req).auth.incorrect_password,
		}); // Unauthorized, password not found
		onIncorrectPassword(browserAgent, record.username);
		return undefined;
	}

	onCorrectPassword(browserAgent);

	return { user_id: record.user_id, username: record.username, roles: record.roles };
}

/**
 * Tests if the request body has valid `username` and `password` properties.
 * If not, this auto-sends a response to the client with an error.
 * @returns true if the body is valid
 */
function verifyBodyHasLoginFormData(req: Request, res: Response): boolean {
	const { username, password } = req.body;

	if (!username || !password) {
		// Only hit by hand-crafted/malformed requests
		console.log(
			`User ${username} sent a bad login request missing either username or password!`,
		);
		res.status(400).json({ message: 'Username and password are required.' }); // 400 Bad request
		return false;
	}

	if (typeof username !== 'string' || typeof password !== 'string') {
		console.log(
			`User ${username} sent a bad login request with either username or password not a string!`,
		);
		res.status(400).json({ message: 'Username and password must be a string.' }); // 400 Bad request
		return false;
	}

	return true;
}

export { testPasswordForRequest };
