// src/server/controllers/accountValidation.ts

/*
 * Server-side username/email/password validation, shared by the register and password-reset flows.
 * Wraps the pure rules in shared/util/validators.ts with the server-only parts: HTTP error
 * responses, profanity matching, email blacklist lookups, and email-domain MX checks.
 */

// @ts-ignore this package has no types
import emailValidator from 'node-email-verifier';
import { Request, Response } from 'express';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

import validators from '../../shared/util/validators.js';

import { isBlacklisted } from '../database/blacklistManager.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

// Constants -------------------------------------------------------------------------

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

/**
 * Usernames new members may not claim. Purely an impersonation/identity guard — our own
 * brand, generic staff/official roles, our engine, and reserved display identities like
 * the guest/deleted-account placeholders.
 */
const reservedUsernames: ReadonlySet<string> = new Set([
	'infinitechess', 'infinitechesssupport',
	'admin', 'administrator', 'root', 'system',
	'moderator', 'mod', 'staff', 'team', 'official',
	'support', 'help', 'helpdesk', 'contact', 'info',
	'security', 'abuse', 'billing', 'payments', 'noreply',
	'hydro', 'hydrochess', 'apeiron', 'engine', 'computer', 'bot',
	'icn', 'ice', 'infinitechessengine', 'infinitechessorg',
	'guest', 'anonymous', 'deleted',
]); // prettier-ignore

// Functions -------------------------------------------------------------------------

/** Returns true if the username passes all format/content checks before account generation. */
function doUsernameFormatChecks(username: string, req: Request, res: Response): boolean {
	const result = validators.validateUsername(username);
	if (result !== validators.UsernameValidationResult.Ok) {
		switch (result) {
			case validators.UsernameValidationResult.UsernameTooShort:
				res.status(400).json({
					field: 'username',
					message: req.t.shared.account.username_short,
				});
				return false;
			case validators.UsernameValidationResult.UsernameTooLong:
				// Unlocalized: only a bot bypassing the form's maxlength can trigger this.
				res.status(400).json({
					field: 'username',
					message: "Username can't be over 20 characters long",
				});
				return false;
			case validators.UsernameValidationResult.UsernameAlphanumeric:
				res.status(400).json({
					field: 'username',
					message: req.t.shared.account.username_alphanumeric,
				});
				return false;
			default:
				// Unlocalized: unreachable defensive fallback
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
			message: req.t.responses.account.username_profane,
		});
		return false;
	}
	return true;
}

/**
 * Returns true if the username is reserved.
 * @param username - The username to check. Case-insensitive.
 */
function checkReserved(username: string): boolean {
	// All reserved names are in lowercase
	return reservedUsernames.has(username.toLowerCase());
}

/**
 * Returns true if profanity/offensive language is found in the string.
 * Uses the obscenity package with English dataset and recommended transformers.
 */
function checkProfanity(string: string): boolean {
	return profanityMatcher.hasMatch(string);
}

/**
 * Returns true if the email passes all format/content checks before account generation.
 * @param email - The email to check. Case in-sensitive.
 */
async function doEmailFormatChecks(email: string, req: Request, res: Response): Promise<boolean> {
	const result = validators.validateEmail(email);
	if (result !== validators.EmailValidationResult.Ok) {
		switch (result) {
			case validators.EmailValidationResult.InvalidFormat:
				res.status(400).json({
					field: 'email',
					message: req.t.shared.account.email_invalid,
				});
				return false;
			case validators.EmailValidationResult.EmailTooLong:
				// Unlocalized: only a bot bypassing the form's maxlength can trigger this.
				res.status(400).json({
					field: 'email',
					message: 'The email is too long',
				});
				return false;
			default:
				// Unlocalized: unreachable defensive fallback
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
				'blacklistLog',
			);
			res.status(422).json({
				field: 'email',
				message: req.t.responses.account.email_blacklisted,
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
			message: req.t.responses.account.email_domain_invalid,
		});
		return false;
	}
	return true;
}

/** Checks an email address's MX records to see if it is valid */
async function isEmailDNSValid(email: string): Promise<boolean> {
	try {
		return await emailValidator(email, { checkMx: true });
	} catch (error) {
		const err = error as Error; // Type assertion
		logEventsAndPrint(
			`Error when validating domain for email "${email}": ${err.stack}`,
			'errLog',
		);
		return true; // Default to true to avoid blocking users.
	}
}

function doPasswordFormatChecks(password: string, req: Request, res: Response): boolean {
	const result = validators.validatePassword(password);
	if (result !== validators.PasswordValidationResult.Ok) {
		switch (result) {
			case validators.PasswordValidationResult.PasswordTooShort:
				res.status(400).json({
					field: 'password',
					message: req.t.shared.account.password_short,
				});
				return false;
			case validators.PasswordValidationResult.PasswordTooLong:
				// Unlocalized: only a bot bypassing the form's maxlength can trigger this.
				res.status(400).json({
					field: 'password',
					message: "Password can't be over 72 characters long",
				});
				return false;
			default:
				// Unlocalized: unreachable defensive fallback
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
	PASSWORD_SALT_ROUNDS,
	checkProfanity,
	checkReserved,
	doUsernameFormatChecks,
	doEmailFormatChecks,
	doPasswordFormatChecks,
};
