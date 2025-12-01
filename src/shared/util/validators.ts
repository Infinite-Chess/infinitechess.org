/**
 * This has shared validators between client and server,
 * to avoid repeating email/password/username validation
 * and possibly missing to update things both in client and server
 * 
 * TODO:
 * - Return list of errors instead of only one, also removes the need for the `Ok` value
 * - Possibly return a class (?) with a .getTranslationKey() function or add some other way to do that (then there could also be the .isValid property)
*/

// i have no idea why eslint complains about unused vars here, maybe someone else knows why and can fix it
/* eslint-disable no-unused-vars */

enum PasswordValidationResult {
	Ok,
    InvalidFormat,
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

/**
 * Usernames that are reserved. New members cannot use these are their name.
 */
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
	const regex = /^[a-zA-Z0-9!@#$%^&*?]+$/;
	if (!regex.test(password)) return PasswordValidationResult.InvalidFormat;
	if (password.toLowerCase() === "password") return PasswordValidationResult.PasswordIsPassword;
	return PasswordValidationResult.Ok;
}

/**
 * Shared logic to validate emails
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
	// eslint-disable-next-line no-control-regex
	const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
	return regex.test(email.toLowerCase());
}

/**
 * Shared logic to validate usernames
 * @param username The username to check
 * @returns `Ok` if the username is valid, otherwise another member of that enum
 * @todo Return a list of errors instead of just one, for better checking (then the Ok could also be replaced by just checking if the list length is 0, which might be cleaner)
 */
function validateUsername(username: string): UsernameValidationResult {
	if (username.length < 3) return UsernameValidationResult.UsernameTooShort;
	if (username.length > 20) return UsernameValidationResult.UsernameTooLong;
	if (!onlyLettersAndNumbers(username)) return UsernameValidationResult.OnlyLettersAndNumbers;
	if (reservedUsernames.includes(username.toLowerCase())) return UsernameValidationResult.UsernameIsReserved;
	return UsernameValidationResult.Ok;
}

function onlyLettersAndNumbers(string: string): boolean {
	if (!string) return true;
	return /^[a-zA-Z0-9]+$/.test(string);
};

export default {
	validatePassword,
	PasswordValidationResult,
	validateEmail,
	EmailValidationResult,
	validateUsername,
	UsernameValidationResult,
};