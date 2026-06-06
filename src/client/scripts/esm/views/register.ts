// src/client/scripts/esm/views/register.ts

/**
 * Client-side logic for the register form (/register).
 *
 * Validates the username/email/password fields (format via the shared validators, plus on-blur
 * availability checks against the server) with "reward early, punish late" timing, and submits
 * via fetch. On success the server has staged a pending registration and set the pending
 * cookie, so the page navigates to /register/awaiting (which owns the "check your email" state,
 * polling, and the change-email recovery control).
 */

import validators from '../../../../shared/util/validators.js';

import { serverFetch } from '../util/serverFetch.js';

// Elements ----------------------------------------------------------

const form = document.querySelector<HTMLFormElement>('#register-form')!;
const usernameInput = document.querySelector<HTMLInputElement>('#username')!;
const emailInput = document.querySelector<HTMLInputElement>('#email')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const submitButton = document.querySelector<HTMLButtonElement>('#register-submit')!;
const usernameError = document.querySelector<HTMLParagraphElement>('#username-error')!;
const emailError = document.querySelector<HTMLParagraphElement>('#email-error')!;
const passwordError = document.querySelector<HTMLParagraphElement>('#password-error')!;
const formError = document.querySelector<HTMLParagraphElement>('#register-error')!;

// State -------------------------------------------------------------

let usernameValid = false;
let emailValid = false;
let passwordValid = false;

// Format error messages (hardcoded English) -------------------------

/** The English format error for a username value, or undefined if its format is valid. */
function usernameFormatError(value: string): string | undefined {
	switch (validators.validateUsername(value)) {
		case validators.UsernameValidationResult.UsernameTooShort:
			return 'Username must be at least 3 characters long';
		case validators.UsernameValidationResult.UsernameTooLong:
			return 'Username must be between 3-20 characters';
		case validators.UsernameValidationResult.OnlyLettersAndNumbers:
			return 'Username must only contain letters A-Z and numbers 0-9';
		case validators.UsernameValidationResult.UsernameIsReserved:
			return 'That username is reserved';
		default:
			return undefined;
	}
}

/** The English format error for an email value, or undefined if its format is valid. */
function emailFormatError(value: string): string | undefined {
	switch (validators.validateEmail(value)) {
		case validators.EmailValidationResult.InvalidFormat:
			return 'This is not a valid email';
		case validators.EmailValidationResult.EmailTooLong:
			return 'The email is too long';
		default:
			return undefined;
	}
}

/** The English format error for a password value, or undefined if its format is valid. */
function passwordFormatError(value: string): string | undefined {
	switch (validators.validatePassword(value)) {
		case validators.PasswordValidationResult.PasswordTooShort:
			return 'Password must be 6+ characters long';
		case validators.PasswordValidationResult.PasswordTooLong:
			return "Password can't be over 72 characters long";
		case validators.PasswordValidationResult.PasswordIsPassword:
			return "Password must not be 'password'";
		default:
			return undefined;
	}
}

// Functions ---------------------------------------------------------

/** Shows an error beneath a field, or clears it when called with no message. */
function setFieldError(
	input: HTMLInputElement,
	errorElement: HTMLParagraphElement,
	message?: string,
): void {
	errorElement.textContent = message ?? '';
	errorElement.classList.toggle('hidden', message === undefined);
	input.classList.toggle('input-error', message !== undefined);
}

/** Shows the form-level submit error, or clears it when called with no message. */
function setFormError(message?: string): void {
	formError.textContent = message ?? '';
	formError.classList.toggle('hidden', message === undefined);
}

/**
 * Reflects the form's *visible* state on the submit button: enabled as long as
 * all three fields have some text and none are currently showing an error.
 * Field errors keep the button disabled until fixed; form errors don't gate it.
 */
function refreshSubmit(): void {
	const allFilled =
		usernameInput.value.length > 0 &&
		passwordInput.value.length > 0 &&
		emailInput.value.length > 0;
	const anyVisibleError = [usernameError, passwordError, emailError].some(
		(el) => !el.classList.contains('hidden'),
	);
	submitButton.disabled = !allFilled || anyVisibleError;
}

/**
 * Runs the synchronous format check for a field and returns whether it's valid.
 * An empty field is invalid but never shows an error (nothing typed yet).
 */
function validateFormat(
	input: HTMLInputElement,
	errorElement: HTMLParagraphElement,
	formatError: (value: string) => string | undefined,
	revealErrors: boolean,
): boolean {
	const message = input.value.length === 0 ? undefined : formatError(input.value);
	const valid = input.value.length > 0 && message === undefined;
	// "Reward early, punish late": on blur (revealErrors) show the error if invalid.
	// While typing, only ever clear a previously-shown error once valid — never
	// introduce a new one mid-keystroke (a half-typed email is "invalid" but shouldn't nag).
	if (revealErrors) setFieldError(input, errorElement, message);
	else if (valid) setFieldError(input, errorElement);
	return valid;
}

/** Submits the register form, navigating to the awaiting page on success. */
async function submitRegister(): Promise<void> {
	// Authoritative gate: a field can be filled but unblurred, so its error may not
	// have surfaced yet (and the button stayed enabled). Reveal any such errors now,
	// then focus the first invalid field and bail without sending.
	usernameValid = validateFormat(usernameInput, usernameError, usernameFormatError, true);
	passwordValid = validateFormat(passwordInput, passwordError, passwordFormatError, true);
	emailValid = validateFormat(emailInput, emailError, emailFormatError, true);
	refreshSubmit();
	if (!usernameValid || !passwordValid || !emailValid) {
		if (!usernameValid) usernameInput.focus();
		else if (!passwordValid) passwordInput.focus();
		else if (!emailValid) emailInput.focus();
		return;
	}

	const username = usernameInput.value;
	const email = emailInput.value;
	const password = passwordInput.value;

	setFormError();
	submitButton.disabled = true;

	try {
		const response = await serverFetch('/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, email, password }),
		});

		if (!response.ok) {
			const result = (await response.json()) as {
				message?: string;
				field?: 'username' | 'email' | 'password';
			};
			// Field-attributable failures (taken/blacklisted/invalid) carry a `field` and render
			// beneath that input; systemic failures (server/network) have none and go form-level.
			const message = result.message ?? 'Something went wrong. Please try again.';
			switch (result.field) {
				case 'username':
					setFieldError(usernameInput, usernameError, message);
					usernameValid = false;
					break;
				case 'email':
					setFieldError(emailInput, emailError, message);
					emailValid = false;
					break;
				case 'password':
					setFieldError(passwordInput, passwordError, message);
					passwordValid = false;
					break;
				default:
					setFormError(message);
			}
			refreshSubmit();
			return;
		}

		// The pending cookie is set; the awaiting page owns the rest (check-email, polling, change-email).
		window.location.assign('/register/awaiting');
	} catch (e: unknown) {
		console.error('Registration request failed:', e);
		setFormError('Network error. Please try again.');
		refreshSubmit(); // Re-enable for a retry.
	}
}

// Event Listeners ---------------------------------------------------

form.addEventListener('submit', (event: SubmitEvent): void => {
	event.preventDefault();
	submitRegister();
});

// While typing, recompute validity for the submit button.
usernameInput.addEventListener('input', (): void => {
	usernameValid = validateFormat(usernameInput, usernameError, usernameFormatError, false);
	setFormError();
	refreshSubmit();
});
passwordInput.addEventListener('input', (): void => {
	passwordValid = validateFormat(passwordInput, passwordError, passwordFormatError, false);
	setFormError();
	refreshSubmit();
});
emailInput.addEventListener('input', (): void => {
	emailValid = validateFormat(emailInput, emailError, emailFormatError, false);
	setFormError();
	refreshSubmit();
});

// On blur, reveal any format error; then — for fields with a server-side check —
// verify availability if the format is valid.
usernameInput.addEventListener('blur', async (): Promise<void> => {
	usernameValid = validateFormat(usernameInput, usernameError, usernameFormatError, true);
	refreshSubmit();
	if (!usernameValid) return;
	try {
		const response = await serverFetch(
			`/register/availability?username=${encodeURIComponent(usernameInput.value)}`,
		);
		const result = (await response.json()) as { allowed: boolean; reason: string };
		if (!result.allowed) {
			setFieldError(usernameInput, usernameError, result.reason);
			usernameValid = false;
			refreshSubmit();
		}
	} catch (e: unknown) {
		console.error('Username availability check failed:', e);
	}
});
passwordInput.addEventListener('blur', (): void => {
	passwordValid = validateFormat(passwordInput, passwordError, passwordFormatError, true);
	refreshSubmit();
});
emailInput.addEventListener('blur', (): void => {
	emailValid = validateFormat(emailInput, emailError, emailFormatError, true);
	refreshSubmit();
});

usernameInput.focus();
