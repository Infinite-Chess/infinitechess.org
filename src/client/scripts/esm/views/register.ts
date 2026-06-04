// src/client/scripts/esm/views/register.ts

/**
 * Client-side logic for the register page (/register).
 *
 * On submit it POSTs to /register; on success it hides the form and reveals the
 * SSR'd "Check your email" card sitting beside it (no DOM building or navigation).
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
const successCard = document.querySelector<HTMLElement>('#register-success')!;

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

/** Submits the register form, swapping in the "Check your Email" state on success. */
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

		const result = (await response.json()) as { message?: string };

		if (!response.ok) {
			// The server reports every failure (validation, conflict, server error)
			// in a single `message` property, already localized.
			setFormError(result.message ?? 'Something went wrong. Please try again.');
			refreshSubmit(); // Re-enable for a retry (form-level errors don't gate the button).
			return;
		}

		showCheckEmail();
	} catch (e: unknown) {
		console.error('Registration request failed:', e);
		setFormError('Network error. Please try again.');
		refreshSubmit(); // Re-enable for a retry.
	}
}

/** Hides the form and reveals the SSR'd "Check your email" confirmation card. */
function showCheckEmail(): void {
	form.classList.add('hidden');
	successCard.classList.remove('hidden');
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
			`/register/username/${encodeURIComponent(usernameInput.value)}`,
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
emailInput.addEventListener('blur', async (): Promise<void> => {
	emailValid = validateFormat(emailInput, emailError, emailFormatError, true);
	refreshSubmit();
	if (!emailValid) return;
	try {
		const response = await serverFetch(
			`/register/email/${encodeURIComponent(emailInput.value)}`,
		);
		const result = (await response.json()) as { valid: boolean; reason?: string };
		if (!result.valid) {
			setFieldError(emailInput, emailError, result.reason);
			emailValid = false;
			refreshSubmit();
		}
	} catch (e: unknown) {
		console.error('Email availability check failed:', e);
	}
});

usernameInput.focus();
