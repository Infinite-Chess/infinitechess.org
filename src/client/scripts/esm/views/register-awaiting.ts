// src/client/scripts/esm/views/register-awaiting.ts

/**
 * Client-side logic for the "check your email" page (/register/awaiting).
 *
 * Polls /api/register/awaiting/status until the pending registration is verified (then redirects home
 * with a welcome toast) or expires (then reloads — the server re-renders as the plain form once
 * the row is no longer active). Also drives the change-email recovery control: a corrected
 * address is PUT to /api/register/awaiting/email; success reloads the page, errors show inline.
 */

import flashtoast from '../util/flashtoast.js';
import { serverfetch } from '../util/serverfetch.js';
import { emailFormatError, setFieldError } from '../util/accountformaterrors.js';

// Constants -------------------------------------------------------------------

/**
 * Backoff schedule for verification polling. Each step's `intervalMs` applies until that much
 * total elapsed time (`untilMs`) has passed since polling began; the final step (`untilMs: Infinity`)
 * then holds steady until the pending registration expires.
 *
 * The medium verify time is ~27 seconds. It drops off sharply after 3-4m.
 */
const POLL_BACKOFF_SCHEDULE: readonly { readonly untilMs: number; readonly intervalMs: number }[] =
	[
		{ untilMs: 1000 * 60 * 1, intervalMs: 3000 }, // 0–1m: every 3s
		{ untilMs: 1000 * 60 * 3, intervalMs: 5000 }, // 1–3m: every 5s
		{ untilMs: 1000 * 60 * 4, intervalMs: 10000 }, // 3–5m: every 10s
		{ untilMs: 1000 * 60 * 10, intervalMs: 20000 }, // 5–10m: every 20s
		{ untilMs: Infinity, intervalMs: 30000 }, // 10m+: every 30s
	];

/**
 * Stop polling after this long, as a backstop. Set just past the 24h pending-registration expiry
 * (EXPIRY_MS, server-side) — by then the poll returns 'expired' and the
 * page reloads, so this only catches a truly orphaned tab (e.g. clock skew) that never does.
 */
const POLL_MAX_DURATION_MS = 1000 * 60 * 60 * 24 + 1000 * 60; // 24h 1m

// Elements --------------------------------------------------------------------

const awaitingCard = document.querySelector<HTMLElement>('#awaiting-card')!;
// Absent in the blacklisted variant, where the change-email field is already expanded.
const changeToggle = document.querySelector<HTMLButtonElement>('#change-email-toggle');
const changeGroup = document.querySelector<HTMLElement>('#change-email')!;
const newEmailInput = document.querySelector<HTMLInputElement>('#new-email')!;
const newEmailError = document.querySelector<HTMLParagraphElement>('#new-email-error')!;
const changeSubmit = document.querySelector<HTMLButtonElement>('#change-email-submit')!;

// State -----------------------------------------------------------------------

/** Pending next-poll timeout id, or undefined when none is armed (paused while hidden, or stopped). */
let pollTimerId: number | undefined;
/** Timestamp (ms) polling began, for choosing the backoff interval and enforcing POLL_MAX_DURATION_MS. */
let pollStartedAt = 0;
/**
 * Whether the poll loop is logically running — true between
 * {@link startPolling} and a terminal stop, even while paused for a hidden tab.
 */
let pollingActive = false;
/**
 * Timestamp (ms) the most recent poll was sent, so reveals and
 * the loop honor the backoff spacing rather than polling sooner.
 */
let lastPollAt = 0;

let newEmailValid = false;

// Verification polling --------------------------------------------------------

/** Returns the backoff interval to wait given how long polling has been running. */
function pollIntervalForElapsed(elapsedMs: number): number {
	for (const step of POLL_BACKOFF_SCHEDULE) {
		if (elapsedMs < step.untilMs) return step.intervalMs;
	}
	return POLL_BACKOFF_SCHEDULE[POLL_BACKOFF_SCHEDULE.length - 1]!.intervalMs;
}

/** Begins polling for email verification. Idempotent — a second call is a no-op. */
function startPolling(): void {
	if (pollingActive) return;
	pollingActive = true;
	pollStartedAt = Date.now();
	pollVerification(); // Check immediately — the link may already be verified.
}

/** Permanently stops the verification poll loop. */
function stopPolling(): void {
	pollingActive = false;
	window.clearTimeout(pollTimerId);
	pollTimerId = undefined;
}

/**
 * Continues the poll loop: polls instantly when at least the current backoff interval has elapsed
 * since the last poll (the usual case on returning to the tab), otherwise arms a timer for just the
 * remaining time. Measuring from the last poll sent means rapid tab reveals can't outpace the
 * schedule. No-op while hidden; the visibility handler re-runs this on show.
 */
function pollNowOrScheduleNext(): void {
	window.clearTimeout(pollTimerId);
	pollTimerId = undefined;
	if (document.visibilityState === 'hidden') return;
	const interval = pollIntervalForElapsed(Date.now() - pollStartedAt);
	const delay = lastPollAt + interval - Date.now();
	if (delay <= 0)
		pollVerification(); // Due now — poll instantly.
	else pollTimerId = window.setTimeout(() => pollVerification(), delay);
}

/**
 * Polls /api/register/awaiting/status once, then schedules the next poll with backoff. `verified` → the
 * server has set the session cookie, so queue a welcome toast and redirect home; `expired` /
 * `blacklisted` → reload (the server re-renders the appropriate variant); `pending` → keep waiting
 * until the duration cap.
 */
async function pollVerification(): Promise<void> {
	if (Date.now() - pollStartedAt > POLL_MAX_DURATION_MS) {
		stopPolling();
		return;
	}
	lastPollAt = Date.now();
	try {
		const response = await serverfetch('/api/register/awaiting/status');
		// Only parse the body if OK: a non-OK status (e.g. a 429 from the rate limiter)
		// isn't the JSON shape we expect, so just keep waiting and retry next tick.
		if (response.ok) {
			const result = (await response.json()) as {
				status: 'pending' | 'verified' | 'expired' | 'blacklisted';
			};
			if (result.status === 'verified') {
				stopPolling();
				flashtoast.queue(t.awaiting.account_activated);
				window.location.assign('/');
				return;
			} else if (result.status === 'expired' || result.status === 'blacklisted') {
				stopPolling();
				// The server redirects 'expired' to /register when there's no pending registration
				window.location.reload();
				return;
			}
			// 'pending' → keep waiting.
		} // else non-OK (e.g. 429) without the JSON shape needed → keep waiting.
	} catch (e: unknown) {
		console.error('Registration poll failed:', e); // Transient; keep polling.
	}
	pollNowOrScheduleNext();
}

/** Page Visibility handler. Hiding the tab pauses the poll loop. */
function handleVisibilityChange(): void {
	if (!pollingActive) return; // Loop already terminated; nothing to pause or resume.
	if (document.visibilityState === 'hidden') {
		window.clearTimeout(pollTimerId);
		pollTimerId = undefined;
	} else {
		pollNowOrScheduleNext();
	}
}

// Change email ----------------------------------------------------------------

/** Shows an inline error beneath the change-email field, or clears it when called with no message. */
function setEmailError(message?: string): void {
	setFieldError(newEmailError, message, newEmailInput);
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
		const response = await serverfetch('/api/register/awaiting/email', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: newEmailInput.value.trim() }),
		});
		if (response.ok) {
			window.location.reload();
		} else {
			// Non-OK (our server's validation error, or a 429).
			// The body carries a { message } we surface to the user.
			const result = (await response.json()) as { message?: string };
			setEmailError(result.message ?? t.shared.errors.fallback);
			changeSubmit.disabled = false;
		}
	} catch (e: unknown) {
		console.error('Change-email request failed:', e);
		setEmailError(t.shared.errors.network);
		changeSubmit.disabled = false;
	}
}

// Event Listeners -------------------------------------------------------------

// The toggle is absent in the blacklisted variant (the field is already expanded there).
changeToggle?.addEventListener('click', (): void => {
	changeToggle.classList.add('hidden');
	changeGroup.classList.remove('hidden');
	newEmailInput.focus();
	// Place the caret at the end of the prefilled email, not at the start.
	// setSelectionRange is ignored on type="email" inputs, so re-assign the value instead.
	const value = newEmailInput.value;
	newEmailInput.value = '';
	newEmailInput.value = value;
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
if (awaitingCard.dataset['awaiting'] === 'true') {
	startPolling();
	// Pause polling while the tab is hidden; poll immediately when it's shown again.
	document.addEventListener('visibilitychange', handleVisibilityChange);
}
