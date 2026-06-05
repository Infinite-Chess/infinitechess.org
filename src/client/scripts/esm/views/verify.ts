// src/client/scripts/esm/views/verify.ts

/**
 * Client-side logic for the inert verify landing page (/verify/:token).
 *
 * Clicking the button POSTs to the /verify/:token path, swaps in place
 * either a success confirmation or an invalid/expired message.
 * A transient network error shows inline and leaves the button clickable.
 */

import { serverFetch } from '../util/serverFetch.js';

// Elements ----------------------------------------------------------

// Present only on the prompt state; the already-verified and invalid states are fully SSR'd, so
// there's nothing to wire up there.
const button = document.querySelector<HTMLButtonElement>('#verify-button');

// Verification ------------------------------------------------------

/** Hides the prompt elements (heading, subtitle, button, inline error) before showing a result state. */
function hidePrompt(): void {
	document.querySelector<HTMLElement>('#verify-title')!.classList.add('hidden');
	document.querySelector<HTMLElement>('#verify-subtitle')!.classList.add('hidden');
	document.querySelector<HTMLElement>('#verify-error')!.classList.add('hidden');
	button!.classList.add('hidden');
}

/** Reveals the invalid/expired state (already rendered, hidden) and removes the prompt. */
function showInvalid(): void {
	hidePrompt();
	document.querySelector<HTMLElement>('#verify-invalid-title')!.classList.remove('hidden');
	document.querySelector<HTMLElement>('#verify-invalid-text')!.classList.remove('hidden');
	document.querySelector<HTMLElement>('#verify-invalid-prompt')!.classList.remove('hidden');
}

/** Shows a transient inline error beneath the button and re-enables it for a retry. */
function showRetryableError(message: string): void {
	const error = document.querySelector<HTMLElement>('#verify-error')!;
	error.textContent = message;
	error.classList.remove('hidden');
	button!.disabled = false;
}

/**
 * Consumes the token: POSTs to the current /verify/:token path. Success swaps in the confirmation;
 * an invalid/expired token (400) reveals the dead-link state; a network error stays retryable.
 */
async function verify(): Promise<void> {
	button!.disabled = true;
	document.querySelector<HTMLElement>('#verify-error')!.classList.add('hidden');
	try {
		// The POST endpoint shares this page's path, so the current URL is already the right target.
		const response = await serverFetch(window.location.pathname, { method: 'POST' });
		if (response.ok) {
			hidePrompt();
			document
				.querySelector<HTMLElement>('#verify-success-title')!
				.classList.remove('hidden');
			document.querySelector<HTMLElement>('#verify-success')!.classList.remove('hidden');
			return;
		}
		// 400 → the token is no longer valid (expired before promotion, or unknown).
		showInvalid();
	} catch (e: unknown) {
		console.error('Verification request failed:', e);
		showRetryableError('Network error. Please try again.');
	}
}

// Event Listeners ---------------------------------------------------

if (button) {
	button.addEventListener('click', (): void => {
		verify();
	});
}
