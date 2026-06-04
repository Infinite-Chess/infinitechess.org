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
	isUsernameTaken,
	isUsernameTakenOrPending,
} from '../database/memberManager.js';
import {
	addPendingRegistration,
	deleteExpiredPendingRegistrationsFor,
	getPendingRegistrationByClaimToken,
	isEmailTakenInPendingByOther,
	isUsernameTakenInPendingByOther,
	PENDING_REGISTRATION_EXPIRY_MILLIS,
	PendingRegistrationRecord,
	updatePendingRegistration,
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
 *
 * If the request already carries a pending cookie whose claim_token matches an
 * active (non-expired, unverified) pending row, the submission is treated as a
 * re-submit: the row is updated in place and the email is re-sent.
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

	// Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
	email = email.toLowerCase();

	// Determine whether this is a re-submit from the same browser.
	const cookieClaimToken: unknown = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	let ownPendingRow: PendingRegistrationRecord | undefined;
	if (typeof cookieClaimToken === 'string' && cookieClaimToken.length > 0) {
		try {
			const row = getPendingRegistrationByClaimToken(cookieClaimToken);
			if (row !== undefined && row.expires_at > Date.now() && row.member_user_id === null) {
				ownPendingRow = row;
			}
		} catch {
			// DB lookup failed; fall through to the fresh-registration path.
		}
	}
	const isUpdate = ownPendingRow !== undefined;

	// These 'return's are so that we don't send duplicate responses,
	// AND so we don't create/update the pending row anyway.
	if (!doUsernameFormatChecks(username, req, res)) return;
	if (!(await doEmailFormatChecks(email, req, res))) return;
	if (!doPasswordFormatChecks(password, req, res)) return;

	// The claim_token lives only in the httpOnly cookie (scopes the poll),
	// whereas the verification_token lives only in the emailed link.
	const claimToken = isUpdate ? ownPendingRow!.claim_token : generateRegistrationToken();

	// Availability checks: fresh → all pending+members; update → other parties only.
	if (!isUpdate) {
		if (isUsernameTakenOrPending(username)) {
			res.status(409).json({
				conflict: getTranslationForReq('server.javascript.ws-username_taken', req),
			});
			return;
		}
		if (isEmailTakenOrPending(email)) {
			res.status(409).json({
				conflict: getTranslationForReq('server.javascript.ws-email_in_use', req),
			});
			return;
		}
	} else {
		if (isUsernameTaken(username) || isUsernameTakenInPendingByOther(username, claimToken)) {
			res.status(409).json({
				conflict: getTranslationForReq('server.javascript.ws-username_taken', req),
			});
			return;
		}
		if (isEmailTaken(email) || isEmailTakenInPendingByOther(email, claimToken)) {
			res.status(409).json({
				conflict: getTranslationForReq('server.javascript.ws-email_in_use', req),
			});
			return;
		}
	}

	// Hash the password now so the plaintext never reaches the pending row.
	const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

	// Rotate the verification_token only when the email changed on a re-submit,
	// so an already-delivered link keeps working on a same-email re-submit.
	const emailChanged = isUpdate && email !== ownPendingRow!.email;
	const verificationToken =
		isUpdate && !emailChanged ? ownPendingRow!.verification_token : generateRegistrationToken();

	try {
		// Clear any expired rows blocking the new username/email UNIQUE constraints.
		deleteExpiredPendingRegistrationsFor(username, email);
		if (isUpdate) {
			updatePendingRegistration(claimToken, username, email, hashedPassword, verificationToken); // prettier-ignore
		} else {
			addPendingRegistration(claimToken, verificationToken, username, email, hashedPassword);
		}
	} catch {
		res.status(500).json({
			error: 'A server side error occurred during registration. Please try again.',
		});
		return;
	}

	// Email the verification link. No `members` row will be created until they verify.
	sendEmailConfirmation(email, username, verificationToken);

	// Scope later poll/resend requests to this pending registration.
	res.cookie(PENDING_REGISTRATION_COOKIE_NAME, claimToken, {
		httpOnly: true,
		sameSite: 'none',
		secure: true,
		maxAge: PENDING_REGISTRATION_EXPIRY_MILLIS,
	});

	res.status(isUpdate ? 200 : 201).json({ success: true });
}

/** Generates a fresh, URL-safe secret for a pending registration's claim/verification token. */
function generateRegistrationToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

/**
 * `POST /register/resend` — re-sends the verification email for the caller's own pending
 * registration. Identified solely by the httpOnly `claim_token` cookie.
 */
function resendPendingVerificationEmail(req: Request, res: Response): void {
	const claimToken = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof claimToken !== 'string' || claimToken.length === 0) {
		res.status(404).json({ message: 'No pending registration found.' });
		return;
	}

	let pending: PendingRegistrationRecord | undefined;
	try {
		pending = getPendingRegistrationByClaimToken(claimToken);
	} catch {
		res.status(500).json({ message: 'A server error occurred.' });
		return;
	}

	if (
		pending === undefined ||
		pending.expires_at <= Date.now() ||
		pending.member_user_id !== null
	) {
		res.status(404).json({ message: 'No pending registration found.' });
		return;
	}

	sendEmailConfirmation(pending.email, pending.username, pending.verification_token);

	res.json({ sent: true });
}

/**
 * `GET /register/poll` — the register browser polls this while waiting for its emailed link to
 * be verified. It is identified by the httpOnly `claim_token` cookie set at registration. Once
 * the pending registration has been promoted, THIS browser (the only one holding the cookie) is
 * issued a session and the pending cookie is cleared.
 *
 * Responds `{ status: 'expired' | 'pending' | 'verified' }`.
 */
function pollPendingRegistration(req: Request, res: Response): void {
	const claimToken = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof claimToken !== 'string' || claimToken.length === 0) {
		res.json({ status: 'expired' });
		return;
	}

	const pending = getPendingRegistrationByClaimToken(claimToken);

	// Unknown cookie (never existed, or already swept).
	if (pending === undefined) {
		res.json({ status: 'expired' });
		return;
	}

	// Not yet verified.
	if (pending.member_user_id === null) {
		// Expired while still waiting → dead link.
		if (pending.expires_at <= Date.now()) res.json({ status: 'expired' });
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
		sameSite: 'none',
		secure: true,
	});

	res.json({ status: 'verified' });
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
 * Route that's called whenever the client unfocuses the email input field.
 * This tells them whether the email is valid or not.
 */
async function checkEmailValidity(req: Request, res: Response): Promise<void> {
	const lowercaseEmail = req.params['email']!.toLowerCase();

	if (isEmailTakenOrPending(lowercaseEmail)) {
		res.json({
			valid: false,
			reason: getTranslationForReq('server.javascript.ws-email_in_use', req),
		});
		return;
	}
	if (isBlacklisted(lowercaseEmail)) {
		res.json({
			valid: false,
			reason: getTranslationForReq('server.javascript.ws-email_blacklisted', req),
		});
		return;
	}
	if (!(await isEmailDNSValid(lowercaseEmail))) {
		res.json({
			valid: false,
			reason: getTranslationForReq('server.javascript.ws-email_domain_invalid', req),
		});
		return;
	}

	// Both checks pass
	res.json({ valid: true });
}

/**
 * Route handler to check if a username is available to use (not taken, reserved, or baaaad word).
 * The request parameters MUST contain the username to test! (different from the body)
 *
 * We send the client the object: `{ allowed: true, reason: '' } | { allowed: false, reason: string }`
 */
function checkUsernameAvailable(req: Request, res: Response): void {
	const username = req.params['username']!;
	const usernameLowercase = username.toLowerCase();

	let allowed = true;
	let reason = '';

	if (isUsernameTakenOrPending(username)) {
		allowed = false;
		reason = getTranslationForReq('server.javascript.ws-username_taken', req);
	}
	if (checkProfanity(usernameLowercase)) {
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
					message: getTranslationForReq(
						'create-account.javascript.js-username_length',
						req,
					),
				});
				return false;
			case validators.UsernameValidationResult.OnlyLettersAndNumbers:
				res.status(400).json({
					message: getTranslationForReq('server.javascript.ws-username_letters', req),
				});
				return false;
			case validators.UsernameValidationResult.UsernameIsReserved:
				res.status(409).json({
					conflict: getTranslationForReq('server.javascript.ws-username_taken', req),
				}); // Code for reserved (but the users don't know that!)
				return false;
			default:
				res.status(400).json({
					message: 'Username is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	if (checkProfanity(username.toLowerCase())) {
		res.status(409).json({
			conflict: getTranslationForReq('server.javascript.ws-username_bad_word', req),
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
					message: getTranslationForReq('server.javascript.ws-email_invalid', req),
				});
				return false;
			case validators.EmailValidationResult.EmailTooLong:
				res.status(400).json({
					message: getTranslationForReq('server.javascript.ws-email_too_long', req),
				});
				return false;
			default:
				res.status(400).json({
					message: 'Email is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	if (isBlacklisted(email)) {
		const errMessage = `Blacklisted email ${email} tried to create an account!`;
		logEventsAndPrint(errMessage, 'blacklistLog.txt');
		res.status(409).json({
			conflict: getTranslationForReq('server.javascript.ws-email_blacklisted', req),
		});
		return false;
	}
	if (!(await isEmailDNSValid(email))) {
		res.status(400).json({
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
					message: getTranslationForReq('server.javascript.ws-password_length', req),
				});
				return false;
			case validators.PasswordValidationResult.PasswordIsPassword:
				res.status(400).json({
					message: getTranslationForReq('server.javascript.ws-password_password', req),
				});
				return false;
			default:
				res.status(400).json({
					message: 'Password is not valid, but the server could not determine why.',
				});
				return false;
		}
	}
	return true;
}

export {
	createNewMember,
	resendPendingVerificationEmail,
	pollPendingRegistration,
	checkEmailValidity,
	checkUsernameAvailable,
	generateAccount,
	doPasswordFormatChecks,
	PASSWORD_SALT_ROUNDS,
	profanityMatcher,
};
