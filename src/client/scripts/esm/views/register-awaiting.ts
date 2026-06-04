// src/client/scripts/esm/views/register-awaiting.ts

/**
 * Client-side logic for the "check your email" page (/register/awaiting).
 *
 * Polls /register/awaiting/poll until the pending registration is verified (then redirects home
 * with a welcome toast) or expires (then reloads — the server re-renders as the plain form once
 * the row is no longer active). Also drives the change-email recovery control: a corrected
 * address is POSTed to /register/awaiting/email; success reloads the page, errors show inline.
 */

import validators from '../../../../shared/util/validators.js';

import flashToast from '../util/flashToast.js';
import { serverFetch } from '../util/serverFetch.js';

// Constants ---------------------------------------------------------

/** How often to poll for verification. */
const POLL_INTERVAL_MS = 3000;
/** Stop polling after this long, so an abandoned tab doesn't loop forever. */
const POLL_MAX_DURATION_MS = 1000 * 60 * 25;

// Elements ----------------------------------------------------------

const awaitingCard = document.querySelector<HTMLElement>('#awaiting-card')!;
// Absent in the blacklisted variant, where the change-email field is already expanded.
const changeToggle = document.querySelector<HTMLButtonElement>('#change-email-toggle');
const changeGroup = document.querySelector<HTMLElement>('#change-email')!;
const newEmailInput = document.querySelector<HTMLInputElement>('#new-email')!;
const newEmailError = document.querySelector<HTMLParagraphElement>('#new-email-error')!;
const changeSubmit = document.querySelector<HTMLButtonElement>('#change-email-submit')!;

// State -------------------------------------------------------------

/** Active /register/poll interval id, or undefined when not polling. */
let pollTimerId: number | undefined;
/** Timestamp (ms) polling began, for enforcing POLL_MAX_DURATION_MS. */
let pollStartedAt = 0;

let newEmailValid = false;

// Verification polling ----------------------------------------------

/** Begins polling for email verification. Idempotent — a second call is a no-op. */
function startPolling(): void {
	if (pollTimerId !== undefined) return;
	pollStartedAt = Date.now();
	pollTimerId = window.setInterval(pollVerification, POLL_INTERVAL_MS);
	pollVerification(); // Check immediately — the link may already be verified.
}

/** Stops the verification poll loop. */
function stopPolling(): void {
	window.clearInterval(pollTimerId);
	pollTimerId = undefined;
}

/**
 * Polls /register/awaiting/poll once. `verified` → the server has set the session cookie, so
 * queue a welcome toast and redirect home; `expired` / `blacklisted` → reload (the server
 * re-renders the appropriate variant); `pending` → keep waiting until the duration cap.
 */
async function pollVerification(): Promise<void> {
	if (Date.now() - pollStartedAt > POLL_MAX_DURATION_MS) {
		stopPolling();
		return;
	}
	try {
		const response = await serverFetch('/register/awaiting/poll');
		const result = (await response.json()) as {
			status: 'pending' | 'verified' | 'expired' | 'blacklisted';
		};
		if (result.status === 'verified') {
			stopPolling();
			flashToast.queue('Your account has been activated!');
			window.location.assign('/');
		} else if (result.status === 'expired' || result.status === 'blacklisted') {
			stopPolling();
			// The server redirects 'expired' to /register when there's no pending registration
			window.location.reload();
		}
		// 'pending' → keep waiting.
	} catch (e: unknown) {
		console.error('Registration poll failed:', e); // Transient; keep polling.
	}
}

// Change email ------------------------------------------------------

/** Shows an inline error beneath the change-email field, or clears it when called with no message. */
function setEmailError(message?: string): void {
	newEmailError.textContent = message ?? '';
	newEmailError.classList.toggle('hidden', message === undefined);
	newEmailInput.classList.toggle('input-error', message !== undefined);
}

/** Returns the English format error for an email value, or undefined if its format is valid. */
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

/**
 * Validates the email format and updates {@link newEmailValid}.
 * @param revealErrors - Shows the error (on blur/submit); false only clears if now valid (while typing).
 */
function validateNewEmail(revealErrors: boolean): void {
	const message =
		newEmailInput.value.length === 0 ? undefined : emailFormatError(newEmailInput.value);
	newEmailValid = newEmailInput.value.length > 0 && message === undefined;
	if (revealErrors) setEmailError(message);
	else if (newEmailValid) setEmailError();
}

/** POSTs the new email; on success reloads the page (the reload is the "it worked" feedback). */
async function submitNewEmail(): Promise<void> {
	// Authoritative gate: reveal any unseen format error and bail without sending.
	validateNewEmail(true);
	if (!newEmailValid) {
		newEmailInput.focus();
		return;
	}
	changeSubmit.disabled = true;
	try {
		const response = await serverFetch('/register/awaiting/email', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: newEmailInput.value }),
		});
		if (response.ok) {
			window.location.reload();
			return;
		}
		const result = (await response.json()) as { message?: string };
		setEmailError(result.message ?? 'Something went wrong. Please try again.');
		changeSubmit.disabled = false;
	} catch (e: unknown) {
		console.error('Change-email request failed:', e);
		setEmailError('Network error. Please try again.');
		changeSubmit.disabled = false;
	}
}

// Event Listeners ---------------------------------------------------

// The toggle is absent in the blacklisted variant (the field is already expanded there).
changeToggle?.addEventListener('click', (): void => {
	changeToggle.classList.add('hidden');
	changeGroup.classList.remove('hidden');
	newEmailInput.focus();
});

changeSubmit.addEventListener('click', (): void => {
	submitNewEmail();
});
newEmailInput.addEventListener('keydown', (event: KeyboardEvent): void => {
	if (event.key === 'Enter') {
		event.preventDefault();
		submitNewEmail();
	}
});

// While typing, use "reward early" — clear a shown error once valid, never introduce a new one.
newEmailInput.addEventListener('input', (): void => validateNewEmail(false));

// On blur, reveal any format error.
newEmailInput.addEventListener('blur', (): void => validateNewEmail(true));

// Resume polling when this is a deliverable pending registration.
if (awaitingCard.dataset['awaiting'] === 'true') startPolling();
