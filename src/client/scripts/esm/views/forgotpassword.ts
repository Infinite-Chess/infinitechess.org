// src/client/scripts/esm/views/forgotpassword.ts

/**
 * Client-side logic for the forgot-password page (/forgot-password).
 *
 * Validates the email format, then POSTs it to /api/forgot-password. On success the card is
 * swapped in place for a generic confirmation — identical wording whether or not the account
 * exists, preventing enumeration. Server errors and network failures surface inline.
 */

import validators from '../../../../shared/util/validators.js';

import { serverfetch } from '../util/serverfetch.js';

// Elements --------------------------------------------------------------------

const form = document.querySelector<HTMLFormElement>('#forgot-form')!;
const emailInput = document.querySelector<HTMLInputElement>('#email')!;
const submitButton = document.querySelector<HTMLButtonElement>('#forgot-submit')!;
const errorElement = document.querySelector<HTMLParagraphElement>('#forgot-error')!;
const confirmation = document.querySelector<HTMLDivElement>('#forgot-confirmation')!;

// Functions -------------------------------------------------------------------

/** Shows an error beneath the field (format, server, or network), or clears it when called with no message. */
function setError(message?: string): void {
	errorElement.textContent = message ?? '';
	errorElement.classList.toggle('hidden', message === undefined);
	emailInput.classList.toggle('input-error', message !== undefined);
}

/** Requests a password-reset link for the entered email. */
async function submitForgotPassword(): Promise<void> {
	const email = emailInput.value.trim();
	if (!email) return; // Backup for whitespace-only input (native `required` blocks truly-empty submits).

	// Validate format client-side for UX only; never reveals whether the address is registered.
	if (validators.validateEmail(email) !== validators.EmailValidationResult.Ok) {
		setError(t.shared.account.email_invalid);
		return;
	}

	setError();
	submitButton.disabled = true;

	try {
		const response = await serverfetch('/api/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		});

		if (response.ok) {
			// Swap the card in place for the generic confirmation. The server
			// returns the same generic 200 regardless of whether the account exists.
			form.classList.add('hidden');
			confirmation.classList.remove('hidden');
			return;
		}

		// Surface only what the server chose to return (e.g. a 429 rate-limit message).
		const result = (await response.json()) as { message?: string };
		setError(result.message ?? t.shared.errors.fallback);
		submitButton.disabled = false;
	} catch (e: unknown) {
		console.error('Forgot-password request failed:', e);
		setError(t.shared.errors.network);
		submitButton.disabled = false;
	}
}

// Event Listeners -------------------------------------------------------------

form.addEventListener('submit', (event: SubmitEvent): void => {
	event.preventDefault();
	submitForgotPassword();
});

// Clear a stale error as soon as the user edits the field.
emailInput.addEventListener('input', () => setError());

emailInput.focus();
