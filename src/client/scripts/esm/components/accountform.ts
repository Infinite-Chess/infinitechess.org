// src/client/scripts/esm/components/accountform.ts

/**
 * Shared field helpers for the account form pages (login, register, register-awaiting,
 * forgot-password, reset-password): localized format-error lookups, field validation, and an
 * inline error setter.
 *
 * The "TooLong" validator cases are intentionally unhandled — only bots or hand-crafted
 * requests reach them, so the server is the authoritative guard there.
 */

import validators from '../../../../shared/util/validators.js';
import interpolate from '../../../../shared/util/interpolate.js';

/** The localized format error for a username, or undefined if valid. */
function usernameError(value: string): string | undefined {
	switch (validators.validateUsername(value)) {
		case validators.UsernameValidationResult.UsernameTooShort:
			return interpolate.interpolate(t.shared.account.username_short, { min: validators.MIN_USERNAME_LENGTH }); // prettier-ignore
		case validators.UsernameValidationResult.UsernameAlphanumeric:
			return t.shared.account.username_alphanumeric;
		default:
			return undefined;
	}
}

/** The localized format error for an email, or undefined if valid. */
function emailError(value: string): string | undefined {
	switch (validators.validateEmail(value.trim())) {
		case validators.EmailValidationResult.InvalidFormat:
			return t.shared.account.email_invalid;
		default:
			return undefined;
	}
}

/** The localized format error for a password, or undefined if valid. */
function passwordError(value: string): string | undefined {
	switch (validators.validatePassword(value)) {
		case validators.PasswordValidationResult.PasswordTooShort:
			return interpolate.interpolate(t.shared.account.password_short, { min: validators.MIN_PASSWORD_LENGTH }); // prettier-ignore
		default:
			return undefined;
	}
}

/**
 * Re-checks a field's format, "reward early, punish late": an error only appears once revealed,
 * but clears the moment the field turns valid. An empty field is invalid but shows no error.
 * @param reveal - Shows any error (on blur or submit), instead of only clearing one (while typing).
 * @returns Whether the field is valid.
 */
function validateField(
	input: HTMLInputElement,
	errorElement: HTMLParagraphElement,
	formatError: (value: string) => string | undefined,
	reveal: boolean,
): boolean {
	const message = input.value.length === 0 ? undefined : formatError(input.value);
	const valid = input.value.length > 0 && message === undefined;
	if (reveal) setFieldError(errorElement, message, input);
	else if (valid) setFieldError(errorElement, undefined, input);
	return valid;
}

/**
 * Shows `message` in `errorElement`, or clears it when omitted. Pass `input` to also toggle its
 * `input-error` class (field-level errors); omit it for form-level errors.
 */
function setFieldError(
	errorElement: HTMLParagraphElement,
	message?: string,
	input?: HTMLInputElement,
): void {
	errorElement.textContent = message ?? '';
	errorElement.classList.toggle('hidden', message === undefined);
	input?.classList.toggle('input-error', message !== undefined);
}

export default {
	usernameError,
	emailError,
	passwordError,
	validateField,
	setFieldError,
};
