// src/shared/util/validators.ts

/**
 * This has shared validators between client and server,
 * to avoid repeating email/password/username validation
 * and possibly missing to update things both in client and server
 *
 * TODO:
 * - Return list of errors instead of only one, also removes the need for the `Ok` value
 * - Possibly return a class (?) with a .getTranslationKey() function or add some other way to do that (then there could also be the .isValid property)
 */

// Constants -------------------------------------------------------------------

enum PasswordValidationResult {
	Ok,
	PasswordTooShort,
	PasswordTooLong,
}

enum EmailValidationResult {
	Ok,
	InvalidFormat,
	EmailTooLong,
}

enum UsernameValidationResult {
	Ok,
	UsernameTooShort,
	UsernameTooLong,
	UsernameAlphanumeric,
}

// Functions -------------------------------------------------------------------

/** Validates a password's length. `Ok` if valid, otherwise the reason it isn't. */
function validatePassword(password: string): PasswordValidationResult {
	if (password.length < 6) return PasswordValidationResult.PasswordTooShort;
	if (password.length > 72) return PasswordValidationResult.PasswordTooLong;
	return PasswordValidationResult.Ok;
}

/**
 * Validates an email's length and format. `Ok` if valid, otherwise the reason it isn't.
 * Does NOT check whether the email is taken or banned — that's the server's job.
 * @param email - The email to check. Case in-sensitive.
 */
function validateEmail(email: string): EmailValidationResult {
	if (email.length > 320) return EmailValidationResult.EmailTooLong;
	if (!isEmailFormatValid(email)) return EmailValidationResult.InvalidFormat;
	return EmailValidationResult.Ok;
}

/** Whether an email matches the RFC 5322 address grammar. */
function isEmailFormatValid(email: string): boolean {
	// Credit for the regex: https://stackoverflow.com/a/201378
	const regex =
		/^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/; // eslint-disable-line no-control-regex
	return regex.test(email.toLowerCase());
}

/**
 * Validates a username's *format* — length and allowed characters.
 * `Ok` if valid, otherwise the reason it isn't.
 */
function validateUsername(username: string): UsernameValidationResult {
	if (username.length < 3) return UsernameValidationResult.UsernameTooShort;
	if (username.length > 20) return UsernameValidationResult.UsernameTooLong;
	// Only alphanumeric characters
	if (!/^[a-zA-Z0-9]+$/.test(username)) return UsernameValidationResult.UsernameAlphanumeric;
	return UsernameValidationResult.Ok;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	PasswordValidationResult,
	EmailValidationResult,
	UsernameValidationResult,
	// Functions
	validatePassword,
	validateEmail,
	validateUsername,
};
