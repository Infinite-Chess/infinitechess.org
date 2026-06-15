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
import { getTranslation } from '../utility/translate.js';
import { escapeLogControlChars, logEventsAndPrint } from '../middleware/logEvents.js';

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

// Functions -------------------------------------------------------------------------

/** Returns true if the username passes all format/content checks before account generation. */
function doUsernameFormatChecks(username: string, req: Request, res: Response): boolean {
	const result = validators.validateUsername(username);
	if (result !== validators.UsernameValidationResult.Ok) {
		switch (result) {
			case validators.UsernameValidationResult.UsernameTooShort:
			case validators.UsernameValidationResult.UsernameTooLong:
				res.status(400).json({
					field: 'username',
					message: getTranslation(
						'create-account.javascript.js-username_length',
						req.lang,
					),
				});
				return false;
			case validators.UsernameValidationResult.OnlyLettersAndNumbers:
				res.status(400).json({
					field: 'username',
					message: getTranslation('server.javascript.ws-username_letters', req.lang),
				});
				return false;
			case validators.UsernameValidationResult.UsernameIsReserved:
				res.status(409).json({
					field: 'username',
					message: getTranslation('server.javascript.ws-username_taken', req.lang),
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
			message: getTranslation('server.javascript.ws-username_bad_word', req.lang),
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
					message: getTranslation('server.javascript.ws-email_invalid', req.lang),
				});
				return false;
			case validators.EmailValidationResult.EmailTooLong:
				res.status(400).json({
					field: 'email',
					message: getTranslation('server.javascript.ws-email_too_long', req.lang),
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
				`Blacklisted email ${escapeLogControlChars(email)} tried to create an account!`,
				'blacklistLog',
			);
			res.status(422).json({
				field: 'email',
				message: getTranslation('server.javascript.ws-email_blacklisted', req.lang),
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
			message: getTranslation('server.javascript.ws-email_domain_invalid', req.lang),
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
			`Error when validating domain for email "${escapeLogControlChars(email)}": ${err.stack}`,
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
			case validators.PasswordValidationResult.PasswordTooLong:
				res.status(400).json({
					field: 'password',
					message: getTranslation('server.javascript.ws-password_length', req.lang),
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
	PASSWORD_SALT_ROUNDS,
	checkProfanity,
	doUsernameFormatChecks,
	doEmailFormatChecks,
	doPasswordFormatChecks,
};
