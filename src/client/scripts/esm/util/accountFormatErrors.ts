// src/client/scripts/esm/util/accountFormatErrors.ts

/**
 * Shared field helpers for the account form pages (login, register, register-awaiting,
 * reset-password): localized format-error lookups and an inline error setter.
 *
 * The "TooLong" validator cases are intentionally unhandled — only bots or hand-crafted
 * requests reach them, so the server is the authoritative guard there.
 */

import validators from '../../../../shared/util/validators.js';

/** The localized format error for a username, or undefined if valid. */
export function usernameFormatError(value: string): string | undefined {
	switch (validators.validateUsername(value)) {
		case validators.UsernameValidationResult.UsernameTooShort:
			return t.shared.account.username_short;
		case validators.UsernameValidationResult.UsernameAlphanumeric:
			return t.shared.account.username_alphanumeric;
		default:
			return undefined;
	}
}

/** The localized format error for an email, or undefined if valid. */
export function emailFormatError(value: string): string | undefined {
	switch (validators.validateEmail(value.trim())) {
		case validators.EmailValidationResult.InvalidFormat:
			return t.shared.account.email_invalid;
		default:
			return undefined;
	}
}

/** The localized format error for a password, or undefined if valid. */
export function passwordFormatError(value: string): string | undefined {
	switch (validators.validatePassword(value)) {
		case validators.PasswordValidationResult.PasswordTooShort:
			return t.shared.account.password_short;
		default:
			return undefined;
	}
}

/**
 * Shows `message` in `errorElement`, or clears it when omitted. Pass `input` to also toggle its
 * `input-error` class (field-level errors); omit it for form-level errors.
 */
export function setFieldError(
	errorElement: HTMLParagraphElement,
	message?: string,
	input?: HTMLInputElement,
): void {
	errorElement.textContent = message ?? '';
	errorElement.classList.toggle('hidden', message === undefined);
	input?.classList.toggle('input-error', message !== undefined);
}
