// src/client/scripts/esm/views/resetpassword.ts

/**
 * Client-side logic for the set-new-password page (/reset-password/:token).
 *
 * Active only in the SSR 'valid' state (the invalid/expired state has no form). Validates
 * the new password against the shared format rules, then POSTs { token, password } to
 * /api/reset-password. Success sets a session cookie, so we queue a toast and navigate home;
 * errors show inline.
 */

import docutil from '../util/docutil.js';
import flashtoast from '../util/flashtoast.js';
import { serverfetch } from '../util/serverfetch.js';
import { passwordFormatError, setFieldError } from '../util/accountformaterrors.js';

import '../util/passwordtoggle.js';

// Elements --------------------------------------------------------------------

// All null in the invalid state (no form rendered).
const form = document.querySelector<HTMLFormElement>('#reset-form');
const passwordInput = document.querySelector<HTMLInputElement>('#new-password');
const errorElement = document.querySelector<HTMLParagraphElement>('#reset-error');
const submitButton = document.querySelector<HTMLButtonElement>('#reset-submit');

// The token is the last path segment of this page's URL (GET /reset-password/:token).
const token = docutil.getLastSegmentOfURL();

// Functions -------------------------------------------------------------------

/** Shows an error beneath the field (format, server, or network), or clears it when called with no message. */
function setError(message?: string): void {
	setFieldError(errorElement!, message, passwordInput!);
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
		const response = await serverfetch('/api/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, password: passwordInput!.value }),
		});

		if (response.ok) {
			// The session cookie is now set; queue a toast that survives the navigation home.
			flashtoast.queue(t.resetpassword.password_reset);
			window.location.assign('/');
			return;
		}

		const result = (await response.json()) as { message?: string; tokenInvalid?: boolean };

		// Token expired since page-load: reload to re-SSR the expired-link card,
		// rather than showing a misleading error beneath the password field.
		if (result.tokenInvalid) {
			window.location.reload();
			return;
		}

		// Other non-OK: the server's independent format re-check (doPasswordFormatChecks)
		// rejected the password, or a server error happened. Surface inline.
		setError(result.message ?? t.shared.errors.fallback);
		refreshSubmit();
	} catch (e: unknown) {
		console.error('Password reset request failed:', e);
		setError(t.shared.errors.network);
		refreshSubmit();
	}
}

// Event Listeners -------------------------------------------------------------

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
