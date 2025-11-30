
// src/server/controllers/createAccountController.ts

/*
 * This module handles create account form data,
 * verifying the data, creating the account,
 * and sending them a verification email.
 * 
 * It also answers requests for whether
 * a specific username or email is available.
 */


import crypto from 'crypto';
import { Request, Response } from 'express';

import bcrypt from 'bcrypt';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
// @ts-ignore
import { getTranslationForReq } from '../utility/translate.js';
// @ts-ignore
import { handleLogin } from './loginController.js';
// @ts-ignore
import emailValidator from 'node-email-verifier';
import { addUser, isEmailTaken, isUsernameTaken, SQLITE_CONSTRAINT_ERROR } from '../database/memberManager.js';
import { sendEmailConfirmation } from './sendMail.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { isEmailBanned } from '../middleware/banned.js';
import validators from "../../shared/util/validators.js";

// Variables -------------------------------------------------------------------------


/**
 * The number of times to SALT passwords before storing in the database.
 * 
 * Consider moving SALT_ROUNDS to a config file or environment variable
 */
const PASSWORD_SALT_ROUNDS: number = 10;

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
 * This route is called whenever the user clicks "Create Account"
 */
async function createNewMember(req: Request, res: Response): Promise<void> {
	if (!req.body) {
		console.log(`User sent a bad create account request missing the whole body!`);
		res.status(400).send("Bad request"); // 400 Bad request
		return;
	}
	// First make sure we have all 3 variables.
	// eslint-disable-next-line prefer-const
	let { username, email, password }: { username: string, email: string, password: string } = req.body;
	if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
		console.error('We received request to create new member without all supplied username, email, and password!');
		res.status(400).redirect('/400'); // Bad request
		return;
	}

	// Make the email lowercase, so we don't run into problems with seeing if capitalized emails are taken!
	email = email.toLowerCase();

	// First we make checks on the username...
	// These 'return's are so that we don't send duplicate responses, AND so we don't create the member anyway.
	if (!doUsernameValidation(username, req, res)) return;
	if (!await doEmailValidation(email, req, res)) return;
	if (!doPasswordFormatChecks(password, req, res)) return;

	try {
		await generateAccount({ username, email, password });
	} catch (error: unknown) {
		let message = error instanceof Error ? error.message : "An unexpected error occurred.";
		// Detect the specific constraint error message that can be thrown
		if (message === SQLITE_CONSTRAINT_ERROR) message = 'The username or email has just been taken.';
		res.status(500).json({ 'error': "Could not generate account. " + message });
		return;
	}

	// Create new login session! They just created an account, so log them in!
	// This will handle our response/redirect too for us!
	handleLogin(req, res);
};

/**
 * Generate an account only from the provided username, email, and password.
 * Regex tests are skipped.
 * @returns If it was a success, the row ID of where the member was inserted. Parent is also the same as their user ID)
 * 
 * @throws If account creation fails for any reason.
 */
async function generateAccount({ username, email, password, autoVerify = false }: { username: string, email: string, password: string, autoVerify?: boolean }): Promise<number> {
	// Use bcrypt to hash & salt password
	const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS); // Passes 10 salt rounds. (standard)
	
	const { is_verified, verification_code, is_verification_notified } = autoVerify ? {
		is_verified: 1 as 0 | 1,
		verification_code: null,
		is_verification_notified: 1 as 0 | 1,
	} : { // Don't auto verify them
		is_verified: 0 as 0 | 1,
		verification_code: crypto.randomBytes(24).toString('base64url'),
		is_verification_notified: 0 as 0 | 1,
	};

	const user_id = addUser(username, email, hashedPassword, is_verified, verification_code, is_verification_notified);

	logEventsAndPrint(`Created new member: ${username}`, 'newMemberLog.txt');

	// SEND EMAIL CONFIRMATION
	if (!autoVerify) sendEmailConfirmation(user_id);

	return user_id;
}

/**
 * Route that's called whenever the client unfocuses the email input field.
 * This tells them whether the email is valid or not.
 */

async function checkEmailValidity(req: Request, res: Response): Promise<void> {
	const lowercaseEmail = req.params['email']!.toLowerCase();

	if (isEmailTaken(lowercaseEmail)) {
		res.json({ "valid": false, "reason": getTranslationForReq('server.javascript.ws-email_in_use', req) });
		return;
	}
	if (!await isEmailDNSValid(lowercaseEmail)) {
		res.json({ "valid": false, "reason": getTranslationForReq('server.javascript.ws-email_domain_invalid', req) });
		return;
	}

	// Both checks pass
	res.json({ "valid": true });
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

	if (isUsernameTaken(username)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_taken", req); }
	if (checkProfanity(usernameLowercase)) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_bad_word", req); }
	// we only check if it's reserved and ignore any other possible reasons it might not be a valid username
	if (validators.validateUsername(username) === validators.UsernameValidationResult.UsernameIsReserved) { allowed = false; reason = getTranslationForReq("server.javascript.ws-username_reserved", req); }

	res.json({
		allowed,
		reason
	});
	return;
}

/** Returns true if the username passes all the checks required before account generation. */
function doUsernameValidation(username: string, req: Request, res: Response): boolean {
	const validatorResult = validators.validateUsername(username);
	if (validatorResult !== validators.UsernameValidationResult.Ok) {
		switch (validatorResult) {
			case validators.UsernameValidationResult.UsernameTooShort:
			case validators.UsernameValidationResult.UsernameTooLong:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_length", req)});
				return false;
			case validators.UsernameValidationResult.OnlyLettersAndNumbers:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-username_letters", req) });
				return false;
			case validators.UsernameValidationResult.UsernameIsReserved:
				res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) }); // Code for reserved (but the users don't know that!)
				return false;
			default:
				res.status(400).json({ 'message': 'Username is not valid, but the server could not determine why.' });
				return false;
		}
	}
	// Then check if the name's taken
	const usernameLowercase = username.toLowerCase();

	// Make sure the username isn't taken!!

	if (isUsernameTaken(username)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_taken", req) });
		return false;
	}
	// Lastly check for profain words
	if (checkProfanity(usernameLowercase)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-username_bad_word", req) });
		return false;
	}

	return true; // Everything's good, no conflicts!
};

/**
 * Returns true if profanity/offensive language is found in the string.
 * Uses the obscenity package with English dataset and recommended transformers.
 */
function checkProfanity(string: string): boolean {
	return profanityMatcher.hasMatch(string);
};

/** Returns true if the email passes all the checks required for account generation. */
async function doEmailValidation(string: string, req: Request, res: Response): Promise<boolean> {
	const validatorResult = validators.validateEmail(string);
	if (validatorResult !== validators.EmailValidationResult.Ok) {
		switch (validatorResult) {
			case validators.EmailValidationResult.InvalidFormat:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_invalid", req) });
				return false;
			case validators.EmailValidationResult.EmailTooLong:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_too_long", req) });
				return false;
			default:
				res.status(400).json({ 'message': 'Email is not valid, but the server could not determine why.' });
				return false;
		}
	}
	if (isEmailTaken(string)) {
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-email_in_use", req) });
		return false;
	}
	if (isEmailBanned(string)) {
		const errMessage = `Banned user with email ${string} tried to recreate their account!`;
		logEventsAndPrint(errMessage, 'bannedIPLog.txt');
		res.status(409).json({ 'conflict': getTranslationForReq("server.javascript.ws-you_are_banned", req) });
		return false;
	}
	if (!await isEmailDNSValid(string)) {
		res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-email_domain_invalid", req) });
		return false;
	}
	return true;
};

/**
 * Checks an email address's MX records to see if it is valid
 */
async function isEmailDNSValid(email: string): Promise<boolean> {
	try {
		return await emailValidator(email, { checkMx: true });
	} catch (error) {
		const err = error as Error; // Type assertion
		logEventsAndPrint(`Error when validating domain for email "${email}": ${err.stack}`, 'errLog.txt');
		return true; // Default to true to avoid blocking users.
	}
}

function doPasswordFormatChecks(password: string, req: Request, res: Response): boolean {
	const validatorResult = validators.validatePassword(password);
	if (validatorResult !== validators.PasswordValidationResult.Ok) {
		switch (validatorResult) {
			case validators.PasswordValidationResult.PasswordTooShort:
			case validators.PasswordValidationResult.PasswordTooLong:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_length", req) });
				return false;
			case validators.PasswordValidationResult.InvalidFormat:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_format", req) });
				return false;
			case validators.PasswordValidationResult.PasswordIsPassword:
				res.status(400).json({ 'message': getTranslationForReq("server.javascript.ws-password_password", req) });
				return false;
			default:
				res.status(400).json({ 'message': 'Email is not valid, but the server could not determine why.' });
				return false;
		}
	}
	return true;
};

export {
	createNewMember,
	checkEmailValidity,
	checkUsernameAvailable,
	generateAccount,
	doPasswordFormatChecks,
	PASSWORD_SALT_ROUNDS,
	profanityMatcher,
};
