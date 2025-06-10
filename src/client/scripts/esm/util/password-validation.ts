// src/client/scripts/esm/util/password-validation.ts

// This file contains reusable validation logic for client-side scripts.

/**
 * Checks if a string contains only allowed letters, numbers, and symbols for a password.
 * @param str The string to test.
 */
export function isValidPasswordFormat(str: string): boolean {
	// This regex must match the one used in your createaccount script.
	const regex = /^[a-zA-Z0-9!@#$%^&*?]+$/;
	return regex.test(str);
}

interface PasswordValidationResult {
	isValid: boolean;
	errorKey: string | null; // A key for your translation files, or null if valid.
}

/**
 * Performs all standard password checks.
 * This function does NOT interact with the DOM. It only returns a result object.
 * @param password The password string to validate.
 * @returns An object indicating if the password is valid and an error key if not.
 */
export function validatePassword(password: string): PasswordValidationResult {
	if (password.length < 6) {
		return { isValid: false, errorKey: 'js-pwd_too_short' };
	}
	if (password.length > 72) {
		return { isValid: false, errorKey: 'js-pwd_too_long' };
	}
	if (!isValidPasswordFormat(password)) {
		return { isValid: false, errorKey: 'js-pwd_incorrect_format' };
	}
	if (password.toLowerCase() === 'password') {
		return { isValid: false, errorKey: 'js-pwd_not_pwd' };
	}

	// If all checks pass:
	return { isValid: true, errorKey: null };
}