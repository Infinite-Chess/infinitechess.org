/**
 * This has shared validators between client and server,
 * to avoid repeating email/password/username validation
 * and possibly missing to update things both in client and server
 *
 * TODO:
 * - Return list of errors instead of only one, also removes the need for the `Ok` value
 * - Possibly return a class (?) with a .getTranslationKey() function or add some other way to do that (then there could also be the .isValid property)
 */

enum PasswordValidationResult {
	Ok,
	PasswordTooShort,
	PasswordTooLong,
	PasswordIsPassword,
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
	OnlyLettersAndNumbers,
	UsernameIsReserved,
}

type PasswordValidationResultTranslations =
	| 'js-pwd_too_short'
	| 'js-pwd_too_long'
	| 'js-pwd_not_pwd';
type EmailValidationResultTranslations = 'js-email_too_long' | 'js-email_invalid';
type UsernameValidationResultTranslations =
	| 'js-username_reserved'
	| 'js-username_tooshort'
	| 'ws-username_length'
	| 'js-username_wrongenc';

const passwordErrorTranslations = new Map<number, PasswordValidationResultTranslations>();
passwordErrorTranslations.set(PasswordValidationResult.PasswordTooShort, 'js-pwd_too_short');
passwordErrorTranslations.set(PasswordValidationResult.PasswordTooLong, 'js-pwd_too_long');
passwordErrorTranslations.set(PasswordValidationResult.PasswordIsPassword, 'js-pwd_not_pwd');

const emailErrorTranslations = new Map<number, EmailValidationResultTranslations>();
emailErrorTranslations.set(EmailValidationResult.EmailTooLong, 'js-email_too_long');
emailErrorTranslations.set(EmailValidationResult.InvalidFormat, 'js-email_invalid');

const usernameErrorTranslations = new Map<number, UsernameValidationResultTranslations>();
usernameErrorTranslations.set(UsernameValidationResult.UsernameIsReserved, 'js-username_reserved');
usernameErrorTranslations.set(UsernameValidationResult.UsernameTooShort, 'js-username_tooshort');
usernameErrorTranslations.set(UsernameValidationResult.UsernameTooLong, 'ws-username_length'); // there is no translation for js-username_toolong
usernameErrorTranslations.set(
	UsernameValidationResult.OnlyLettersAndNumbers,
	'js-username_wrongenc',
);

function getPasswordErrorTranslation(
	err: PasswordValidationResult,
): PasswordValidationResultTranslations | undefined {
	return passwordErrorTranslations.get(err);
}

function getEmailErrorTranslation(
	err: EmailValidationResult,
): EmailValidationResultTranslations | undefined {
	return emailErrorTranslations.get(err);
}

function getUsernameErrorTranslation(
	err: UsernameValidationResult,
): UsernameValidationResultTranslations | undefined {
	return usernameErrorTranslations.get(err);
}

/** Usernames that are reserved. New members cannot use these are their name. */
// prettier-ignore
const reservedUsernames: string[] = [
	'infinitechess',
	'support', 'infinitechesssupport',
	'administrator',
	'amazon', 'amazonsupport', 'aws', 'awssupport',
	'apple', 'applesupport',
	'microsoft', 'microsoftsupport',
	'google', 'googlesupport',
	'adobe', 'adobesupport',
	'youtube', 'facebook', 'tiktok', 'twitter', 'x', 'instagram', 'snapchat',
	'tesla', 'elonmusk', 'meta',
	'walmart', 'costco',
	'valve', 'valvesupport',
	'github',
	'nvidia', 'amd', 'intel', 'msi', 'tsmc', 'gigabyte',
	'roblox',
	'minecraft',
	'fortnite',
	'teamfortress2',
	'amongus', 'innersloth', 'henrystickmin',
	'halflife', 'halflife2', 'gordonfreeman',
	'epic', 'epicgames', 'epicgamessupport',
	'taylorswift', 'kimkardashian', 'tomcruise', 'keanureeves', 'morganfreeman', 'willsmith',
	'office', 'office365',
	'usa', 'america',
	'donaldtrump', 'joebiden'
];

/**
 * Shared logic to validate passwords
 * @param password The password to check
 * @returns `Ok` if the password is valid, otherwise another member of that enum
 */
function validatePassword(password: string): PasswordValidationResult {
	if (password.length < 6) return PasswordValidationResult.PasswordTooShort;
	if (password.length > 72) return PasswordValidationResult.PasswordTooLong;
	if (password.toLowerCase() === 'password') return PasswordValidationResult.PasswordIsPassword;
	return PasswordValidationResult.Ok;
}

/**
 * Shared logic to validate emails.
 * **Note**: Does not check if the email is taken or banned, that's on the server to do.
 * @param email The email to check
 * @returns `Ok` if the email is valid, otherwise another member of that enum
 */
function validateEmail(email: string): EmailValidationResult {
	if (email.length > 320) return EmailValidationResult.EmailTooLong;
	if (!validateEmailFormat(email)) return EmailValidationResult.InvalidFormat;
	return EmailValidationResult.Ok;
}

function validateEmailFormat(email: string): boolean {
	// Credit for the regex: https://stackoverflow.com/a/201378
	// prettier-ignore
	const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/; // eslint-disable-line no-control-regex
	return regex.test(email.toLowerCase());
}

/**
 * Shared logic to validate usernames.
 * **Note**: Does not check if the username is taken, that's on the server to do.
 * @param username The username to check
 * @returns `Ok` if the username is valid, otherwise another member of that enum
 * @todo Return a list of errors instead of just one, for better checking (then the Ok could also be replaced by just checking if the list length is 0, which might be cleaner)
 */
function validateUsername(username: string): UsernameValidationResult {
	if (username.length < 3) return UsernameValidationResult.UsernameTooShort;
	if (username.length > 20) return UsernameValidationResult.UsernameTooLong;
	if (!onlyLettersAndNumbers(username)) return UsernameValidationResult.OnlyLettersAndNumbers;
	if (reservedUsernames.includes(username.toLowerCase()))
		return UsernameValidationResult.UsernameIsReserved;
	return UsernameValidationResult.Ok;
}

function onlyLettersAndNumbers(string: string): boolean {
	if (!string) return true;
	return /^[a-zA-Z0-9]+$/.test(string);
}

export default {
	validatePassword,
	PasswordValidationResult,
	validateEmail,
	EmailValidationResult,
	validateUsername,
	UsernameValidationResult,
	getPasswordErrorTranslation,
	getEmailErrorTranslation,
	getUsernameErrorTranslation,
};
