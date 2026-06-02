// src/client/scripts/esm/views/login.ts

/**
 * Client-side logic for the login page (/login).
 *
 * Submits the credentials to the /auth endpoint. On success it redirects to
 * the page named by the `redirectTo` query param, or the home page otherwise.
 * Failures are surfaced inline beneath the form.
 */

import docutil from '../util/docutil.js';

// Elements ----------------------------------------------------------

const form = document.querySelector<HTMLFormElement>('#login-form')!;
const usernameInput = document.querySelector<HTMLInputElement>('#username')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const keepLoggedInInput = document.querySelector<HTMLInputElement>('#keep-logged-in')!;
const submitButton = document.querySelector<HTMLButtonElement>('#login-submit')!;
const errorElement = document.querySelector<HTMLParagraphElement>('#login-error')!;

// Functions ---------------------------------------------------------

/** Displays an error beneath the form, or clears it when called with no message. */
function setError(message?: string): void {
	errorElement.textContent = message ?? '';
	errorElement.classList.toggle('hidden', message === undefined);
}

/** Submits the login form to the server. */
async function submitLogin(): Promise<void> {
	const username = usernameInput.value.trim();
	const password = passwordInput.value;
	if (!username || !password) return; // Backup for whitespace-only input (native `required` blocks truly-empty submits).

	setError();
	submitButton.disabled = true;

	try {
		const response = await fetch('/auth', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'is-fetch-request': 'true' },
			body: JSON.stringify({ username, password, keepLoggedIn: keepLoggedInInput.checked }),
		});

		const result = (await response.json()) as { message: string };

		if (!response.ok) {
			setError(result.message);
			submitButton.disabled = false;
			return;
		}

		// Success — the session cookie is now set; navigate away.
		const redirectTo = docutil.getQueryParam('redirectTo');
		window.location.href = redirectTo ?? '/';
	} catch (e: unknown) {
		console.error('Login request failed:', e);
		setError(t.login.network_error);
		submitButton.disabled = false;
	}
}

// Event Listeners ---------------------------------------------------

form.addEventListener('submit', (event: SubmitEvent): void => {
	event.preventDefault();
	submitLogin();
});

// Clear a stale error as soon as the user edits their credentials.
usernameInput.addEventListener('input', (): void => setError());
passwordInput.addEventListener('input', (): void => setError());

usernameInput.focus();
