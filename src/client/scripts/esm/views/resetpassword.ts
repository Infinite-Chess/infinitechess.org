// src/client/scripts/esm/views/resetpassword.ts

/**
 * Client-side logic for the set-new-password page (/reset-password/:token).
 *
 * Active only in the SSR 'valid' state (the invalid/expired state has no form). Validates
 * the new password against the shared format rules, then POSTs { token, password } to
 * /api/reset-password. Success sets a session cookie, so we queue a toast and navigate home;
 * errors show inline.
 */

import validators from '../../../../shared/util/validators.js';

import docutil from '../util/docutil.js';
import flashToast from '../util/flashToast.js';
import { serverFetch } from '../util/serverFetch.js';

// Elements ----------------------------------------------------------

// All null in the invalid state (no form rendered).
const form = document.querySelector<HTMLFormElement>('#reset-form');
const passwordInput = document.querySelector<HTMLInputElement>('#new-password');
const errorElement = document.querySelector<HTMLParagraphElement>('#reset-error');
const submitButton = document.querySelector<HTMLButtonElement>('#reset-submit');

// The token is the last path segment of this page's URL (GET /reset-password/:token).
const token = docutil.getLastSegmentOfURL();

// Functions ---------------------------------------------------------

/**
 * Returns the localized format error for a password value, or undefined if its format is valid.
 * Only bots or hand crafted PUTs can trigger PasswordTooLong, so that case is ignored.
 */
function passwordFormatError(value: string): string | undefined {
	switch (validators.validatePassword(value)) {
		case validators.PasswordValidationResult.PasswordTooShort:
			return t.shared.account.password_short;
		default:
			return undefined;
	}
}

/** Shows an error beneath the field (format, server, or network), or clears it when called with no message. */
function setError(message?: string): void {
	errorElement!.textContent = message ?? '';
	errorElement!.classList.toggle('hidden', message === undefined);
	passwordInput!.classList.toggle('input-error', message !== undefined);
}

/** Enables the submit button once the password is a valid length. */
function refreshSubmit(): void {
	submitButton!.disabled = passwordFormatError(passwordInput!.value) !== undefined;
}

/** Submits the new password, navigating home on success. */
async function submit(): Promise<void> {
	// Authoritative gate: reveal any unseen format error, focus the field, and bail.
	const passwordMessage = passwordFormatError(passwordInput!.value);
	if (passwordMessage !== undefined) {
		setError(passwordMessage);
		passwordInput!.focus();
		return;
	}

	setError();
	submitButton!.disabled = true;

	try {
		const response = await serverFetch('/api/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, password: passwordInput!.value }),
		});

		if (response.ok) {
			// The session cookie is now set; queue a toast that survives the navigation home.
			flashToast.queue('Your password has been reset!');
			window.location.assign('/');
			return;
		}

		// Non-OK: e.g. the token expired between page-load and submit, the server's independent
		// format re-check (doPasswordFormatChecks) rejected it, or a server error. Surface inline.
		const result = (await response.json()) as { message?: string };
		setError(result.message ?? t.shared.errors.fallback);
		refreshSubmit();
	} catch (e: unknown) {
		console.error('Password reset request failed:', e);
		setError(t.shared.errors.network);
		refreshSubmit();
	}
}

// Event Listeners ---------------------------------------------------

// Only wire up in the SSR 'valid' state; the invalid state has no form (the refs above are null).
if (form) {
	form.addEventListener('submit', (event: SubmitEvent): void => {
		event.preventDefault();
		submit();
	});

	// While typing, "reward early": clear a shown error once valid, and recompute the submit gate.
	passwordInput!.addEventListener('input', (): void => {
		if (passwordFormatError(passwordInput!.value) === undefined) setError();
		refreshSubmit();
	});

	// On blur, reveal any format error.
	passwordInput!.addEventListener('blur', (): void => {
		setError(passwordFormatError(passwordInput!.value));
		refreshSubmit();
	});

	// Enter on a too-short password can't submit (disabled button), so reveal the error like blur.
	passwordInput!.addEventListener('keydown', (event: KeyboardEvent): void => {
		if (event.key === 'Enter') setError(passwordFormatError(passwordInput!.value));
	});

	passwordInput!.focus();
}
