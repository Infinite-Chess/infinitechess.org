// src/server/controllers/createAccountController.ts

/*
 * Handles the register form: validates the submission, then stages a pending
 * registration and emails a verification link (no member is created until the
 * link is verified). Also answers username/email availability checks.
 *
 * generateAccount() additionally creates a verified member directly, for dev
 * seeding and tests.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
// @ts-ignore this package has no types
import emailValidator from 'node-email-verifier';
import { Request, Response } from 'express';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

import validators from '../../shared/util/validators.js';

import { isBlacklisted } from '../database/blacklistManager.js';
import { createNewSession } from './authenticationTokens/sessionManager.js';
import { getTranslationForReq } from '../utility/translate.js';
import { sendEmailConfirmation } from './emailController.js';
import { logEvents, logEventsAndPrint } from '../middleware/logEvents.js';
import {
	addUser,
	getMemberDataByCriteria,
	isEmailTaken,
	isEmailTakenOrPending,
	isUsernameTakenOrPending,
} from '../database/memberManager.js';
import {
	addPendingRegistration,
	deleteExpiredPendingRegistrationsFor,
	getPendingRegistrationByClaimToken,
	isEmailTakenInPendingByOther,
	PENDING_REGISTRATION_EXPIRY_MILLIS,
	PendingRegistrationRecord,
	updatePendingRegistrationEmail,
} from '../database/pendingRegistrationManager.js';

// Variables -------------------------------------------------------------------------

/**
 * Name of the httpOnly cookie that holds a pending registration's `claim_token`,
 * set when the register form is submitted. The poll/resend endpoints
 * read it to scope a request to its own pending registration.
 */
const PENDING_REGISTRATION_COOKIE_NAME = 'pending_registration';

/**
 * The number of times to SALT passwords before storing in the database.
 * 10 is standard.
 */
const PASSWORD_SALT_ROUNDS = 10;

/**
 * Initialize the obscenity profanity matcher.
 * Uses the English dataset with recommended transformers.
 */
const profanityMatcher = new RegExpMatcher({
	...englishDataset.build(),
	...englishRecommendedTransformers,
});

// Functions -------------------------------------------------------------------------

/**
 * `POST /register` — validates the submission, stages a pending registration,
 * emails a verification link, and sets the pending cookie. Creates no member.
 */
async function createNewMember(req: Request, res: Response): Promise<void> {
	// First make sure we have all 3 variables.
	// eslint-disable-next-line prefer-const
	let { username, email, password } = req.body;
	if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
		console.error(
			'We received request to create new member without all supplied username, email, and password!',
		);
		res.status(400).redirect('/400'); // Bad request
		return;
	}

	// Two-tab guard: a single pending cookie can't track two registrations. If this browser
	// already has one in progress, don't create another — report success so the page simply
	// navigates to /register/awaiting for the existing registration.
	if (getOwnActivePendingRegistration(req) !== undefined) {
		res.sendStatus(200);
		return;
	}

	// Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
	email = email.toLowerCase();

	// These 'return's are so that we don't send duplicate responses,
	// AND so we don't create the pending row anyway.
	if (!doUsernameFormatChecks(username, req, res)) return;
	if (!(await doEmailFormatChecks(email, req, res))) return;
	if (!doPasswordFormatChecks(password, req, res)) return;

	let usernameTaken: boolean;
	let emailTaken: boolean;
	try {
		usernameTaken = isUsernameTakenOrPending(username);
		emailTaken = isEmailTakenOrPending(email);
	} catch {
		res.status(500).json({
			message: 'A server error occurred. Please try again.',
		});
		return;
	}

	if (usernameTaken) {
		res.status(409).json({
			field: 'username',
			message: getTranslationForReq('server.javascript.ws-username_taken', req),
		});
		return;
	}
	if (emailTaken) {
		res.status(409).json({
			field: 'email',
			message: getTranslationForReq('server.javascript.ws-email_in_use', req),
		});
		return;
	}

	// Hash the password now so the plaintext never reaches the pending row.
	const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

	// Two deliberately-separate secrets: the claim_token lives only in the httpOnly cookie
	// (scopes the poll), the verification_token only in the emailed link.
	const claimToken = generateRegistrationToken();
	const verificationToken = generateRegistrationToken();

	try {
		// Clear any expired rows blocking the new username/email UNIQUE constraints.
		deleteExpiredPendingRegistrationsFor(username, email);
		addPendingRegistration(claimToken, verificationToken, username, email, hashedPassword);
	} catch {
		res.status(500).json({
			message: 'A server error occurred. Please try again.',
		});
		return;
	}

	// Email the verification link. No `members` row will be created until they verify.
	sendEmailConfirmation(email, username, verificationToken);

	// Scope later poll/change-email requests to this pending registration.
	res.cookie(PENDING_REGISTRATION_COOKIE_NAME, claimToken, {
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: PENDING_REGISTRATION_EXPIRY_MILLIS,
	});

	res.sendStatus(201);
}

/** Generates a fresh, URL-safe secret for a pending registration's claim/verification token. */
function generateRegistrationToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

/**
 * Returns the caller's own active (non-expired, still-unverified) pending registration,
 * identified solely by the httpOnly `claim_token` cookie — or undefined if there is none.
 */
function getOwnActivePendingRegistration(req: Request): PendingRegistrationRecord | undefined {
	const cookieClaimToken: unknown = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof cookieClaimToken !== 'string' || cookieClaimToken.length === 0) return undefined;
	try {
		const row = getPendingRegistrationByClaimToken(cookieClaimToken);
		if (row !== undefined && row.expires_at > Date.now() && row.member_user_id === null) {
			return row;
		}
	} catch {
		// DB lookup failed; treat as no pending registration.
	}
	return undefined;
}

/**
 * SSR state for the awaiting page (`GET /register/awaiting`) and the `GET /register` redirect,
 * derived from the pending-registration cookie: the active pending registration's email (shown
 * in the change-email field) and whether that address is blacklisted — or `null` if there is no
 * active pending registration.
 */
function getAwaitingPageState(req: Request): { email: string; blacklisted: boolean } | null {
	const pending = getOwnActivePendingRegistration(req);
	if (pending === undefined) return null;
	try {
		return { email: pending.email, blacklisted: isBlacklisted(pending.email) };
	} catch {
		// DB read failed (already logged). Assume not blacklisted so the awaiting page still renders;
		// a genuinely blacklisted address is re-checked in subsequent polls.
		return { email: pending.email, blacklisted: false };
	}
}

/**
 * `PUT /api/register/awaiting/email` — changes the email on the caller's own pending registration
 * (identified by the httpOnly `claim_token` cookie), re-validates the new address, rotates the
 * verification token, refreshes the expiry, and re-sends the verification email.
 */
async function changePendingEmail(req: Request, res: Response): Promise<void> {
	const pending = getOwnActivePendingRegistration(req);
	if (pending === undefined) {
		res.status(404).json({ message: 'No pending registration found.' });
		return;
	}

	let { email } = req.body;
	if (typeof email !== 'string') {
		res.status(400).json({ message: 'Email is required.' });
		return;
	}
	email = email.toLowerCase();

	// Re-validate the new address (format, blacklist, MX) — same checks as registration.
	if (!(await doEmailFormatChecks(email, req, res))) return;

	try {
		// Availability: reject a real member's email or another party's pending email. The caller's
		// own row is excluded, so re-submitting the same address is allowed (it just re-sends).
		const emailTaken =
			isEmailTaken(email) || isEmailTakenInPendingByOther(email, pending.claim_token);

		if (emailTaken) {
			res.status(409).json({
				message: getTranslationForReq('server.javascript.ws-email_in_use', req),
			});
			return;
		}

		// Rotate the verification token so the new address gets a fresh link and any
		// already-delivered link to the old address stops working.
		const verificationToken = generateRegistrationToken();

		// Clear any expired row blocking the new email's UNIQUE constraint.
		deleteExpiredPendingRegistrationsFor(pending.username, email);
		updatePendingRegistrationEmail(pending.claim_token, email, verificationToken);

		sendEmailConfirmation(email, pending.username, verificationToken);
		res.sendStatus(200);
	} catch {
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
		return;
	}
}

/**
 * `GET /api/register/awaiting/status` — the register browser's awaiting page polls this while
 * waiting for its emailed link to be verified. It is identified by the httpOnly `claim_token`
 * cookie set at registration. Once the pending registration has been promoted, THIS browser
 * (the only one holding the cookie) is issued a session and the pending cookie is cleared.
 *
 * Responds `{ status: 'expired' | 'pending' | 'verified' }`.
 */
function pollPendingRegistration(req: Request, res: Response): void {
	const claimToken = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof claimToken !== 'string' || claimToken.length === 0) {
		res.json({ status: 'expired' });
		return;
	}

	try {
		const pending = getPendingRegistrationByClaimToken(claimToken);

		// Unknown cookie (never existed, or already swept).
		if (pending === undefined) {
			res.json({ status: 'expired' });
			return;
		}

		// Not yet verified.
		if (pending.member_user_id === null) {
			if (pending.expires_at <= Date.now()) res.json({ status: 'expired' });
			else if (isBlacklisted(pending.email)) res.json({ status: 'blacklisted' });
			else res.json({ status: 'pending' });
			return;
		}

		// Verified and created → issue a session to THIS browser, then clear its pending cookie.
		const member = getMemberDataByCriteria(
			['username', 'roles'],
			'user_id',
			pending.member_user_id,
		);
		if (member === undefined) {
			logEventsAndPrint(
				`Pending registration verified to non-existent member_user_id (${pending.member_user_id})!`,
				'errLog.txt',
			);
			res.json({ status: 'expired' });
			return;
		}

		// roles is a stringified JSON array in the database; parse it.
		const roles = member.roles !== null ? JSON.parse(member.roles) : null;
		createNewSession(req, res, pending.member_user_id, member.username, roles, false);

		// Idempotent: do NOT delete the pending row (let the cleanup sweep handle it), so a refreshed
		// or duplicate waiting tab that still holds the cookie and polls again resolves cleanly.
		res.clearCookie(PENDING_REGISTRATION_COOKIE_NAME, {
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
		});

		res.json({ status: 'verified' });
	} catch {
		res.json({ status: 'pending' }); // Allows the client to poll again
	}
}

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @returns If it was a success, the row ID of where the member was inserted (same as their user_id).
 *
 * @throws If account creation fails for any reason.
 */
async function generateAccount({
	username,
	email,
	password,
}: {
	username: string;
	email: string;
	password: string;
	autoVerify?: boolean;
}): Promise<number> {
	// Use bcrypt to hash & salt password
	const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS); // Passes 10 salt rounds. (standard)

	const { is_verified, verification_code, is_verification_notified } = {
		is_verified: 1 as 0 | 1,
		verification_code: null,
		is_verification_notified: 1 as 0 | 1,
	};

	const user_id = addUser(
		username,
		email,
		hashedPassword,
		is_verified,
		verification_code,
		is_verification_notified,
	);

	logEvents(`Manually generated new member: ${username}`, 'newMemberLog.txt');

	return user_id;
}

/**
 * Route handler to check if a username is available to use (not taken, reserved, or baaaad word).
 * The username to test is supplied as the `username` query parameter (e.g. `?username=bob`).
 *
 * We send the client the object: `{ allowed: true, reason: '' } | { allowed: false, reason: string }`
 */
function checkUsernameAvailable(req: Request, res: Response): void {
	const username = req.query['username'];
	if (typeof username !== 'string' || username.length === 0) {
		// Unlocalized because the client always provides this
		res.status(400).json({ allowed: false, reason: 'Missing username query parameter.' });
		return;
	}
	let allowed = true;
	let reason = '';

	try {
		if (isUsernameTakenOrPending(username)) {
			allowed = false;
			reason = getTranslationForReq('server.javascript.ws-username_taken', req);
		}
	} catch {
		// DB read failed (already logged)
		res.sendStatus(500);
		return;
	}
	if (checkProfanity(username)) {
		allowed = false;
		reason = getTranslationForReq('server.javascript.ws-username_bad_word', req);
	}
	// we only check if it's reserved and ignore any other possible reasons it might not be a valid username
	if (
		validators.validateUsername(username) ===
		validators.UsernameValidationResult.UsernameIsReserved
	) {
		allowed = false;
		reason = getTranslationForReq('create-account.javascript.js-username_reserved', req);
	}

	res.json({
		allowed,
		reason,
	});
	return;
}

/** Returns true if the username passes all format/content checks before account generation. */
function doUsernameFormatChecks(username: string, req: Request, res: Response): boolean {
	const result = validators.validateUsername(username);
	if (result !== validators.UsernameValidationResult.Ok) {
		switch (result) {
			case validators.UsernameValidationResult.UsernameTooShort:
			case validators.UsernameValidationResult.UsernameTooLong:
				res.status(400).json({
					field: 'username',
					message: getTranslationForReq(
						'create-account.javascript.js-username_length',
						req,
					),
				});
				return false;
			case validators.UsernameValidationResult.OnlyLettersAndNumbers:
				res.status(400).json({
					field: 'username',
					message: getTranslationForReq('server.javascript.ws-username_letters', req),
				});
				return false;
			case validators.UsernameValidationResult.UsernameIsReserved:
				res.status(409).json({
					field: 'username',
					message: getTranslationForReq('server.javascript.ws-username_taken', req),
				}); // Code for reserved (but the users don't know that!)
				return false;
			default:
				res.status(400).json({
					field: 'username',
					message: 'Username is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	if (checkProfanity(username)) {
		res.status(409).json({
			field: 'username',
			message: getTranslationForReq('server.javascript.ws-username_bad_word', req),
		});
		return false;
	}
	return true;
}

/**
 * Returns true if profanity/offensive language is found in the string.
 * Uses the obscenity package with English dataset and recommended transformers.
 */
function checkProfanity(string: string): boolean {
	return profanityMatcher.hasMatch(string);
}

/** Returns true if the email passes all format/content checks before account generation. */
async function doEmailFormatChecks(email: string, req: Request, res: Response): Promise<boolean> {
	const result = validators.validateEmail(email);
	if (result !== validators.EmailValidationResult.Ok) {
		switch (result) {
			case validators.EmailValidationResult.InvalidFormat:
				res.status(400).json({
					field: 'email',
					message: getTranslationForReq('server.javascript.ws-email_invalid', req),
				});
				return false;
			case validators.EmailValidationResult.EmailTooLong:
				res.status(400).json({
					field: 'email',
					message: getTranslationForReq('server.javascript.ws-email_too_long', req),
				});
				return false;
			default:
				res.status(400).json({
					field: 'email',
					message: 'Email is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	try {
		if (isBlacklisted(email)) {
			logEventsAndPrint(
				`Blacklisted email ${email} tried to create an account!`,
				'blacklistLog.txt',
			);
			res.status(422).json({
				field: 'email',
				message: getTranslationForReq('server.javascript.ws-email_blacklisted', req),
			});
			return false;
		}
	} catch {
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
		return false;
	}
	if (!(await isEmailDNSValid(email))) {
		res.status(400).json({
			field: 'email',
			message: getTranslationForReq('server.javascript.ws-email_domain_invalid', req),
		});
		return false;
	}
	return true;
}

/**
 * Checks an email address's MX records to see if it is valid
 */
async function isEmailDNSValid(email: string): Promise<boolean> {
	try {
		return await emailValidator(email, { checkMx: true });
	} catch (error) {
		const err = error as Error; // Type assertion
		logEventsAndPrint(
			`Error when validating domain for email "${email}": ${err.stack}`,
			'errLog.txt',
		);
		return true; // Default to true to avoid blocking users.
	}
}

function doPasswordFormatChecks(password: string, req: Request, res: Response): boolean {
	const result = validators.validatePassword(password);
	if (result !== validators.PasswordValidationResult.Ok) {
		switch (result) {
			case validators.PasswordValidationResult.PasswordTooShort:
			case validators.PasswordValidationResult.PasswordTooLong:
				res.status(400).json({
					field: 'password',
					message: getTranslationForReq('server.javascript.ws-password_length', req),
				});
				return false;
			default:
				res.status(400).json({
					field: 'password',
					message: 'Password is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	return true;
}

export {
	createNewMember,
	getAwaitingPageState,
	changePendingEmail,
	pollPendingRegistration,
	checkUsernameAvailable,
	generateAccount,
	doPasswordFormatChecks,
	PASSWORD_SALT_ROUNDS,
	profanityMatcher,
};
