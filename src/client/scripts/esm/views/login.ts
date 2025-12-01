// src/client/scripts/esm/views/login.ts

/**
 * This script handles the client-side logic for the login and forgot-password forms.
 */

// --- Element Selectors ---
const element_usernameInput = document.getElementById('username') as HTMLInputElement;
const element_passwordInput = document.getElementById('password') as HTMLInputElement;
const element_submitButton = document.getElementById('submit') as HTMLInputElement;

const element_forgotLink = document.getElementById('forgot-link') as HTMLAnchorElement;
const element_backToLoginLink = document.getElementById('back-to-login-link') as HTMLAnchorElement;

const element_forgotEmailInput = document.getElementById('forgot-email') as HTMLInputElement;
const element_forgotSubmitButton = document.getElementById('forgot-submit') as HTMLInputElement;

const element_loginForm = document.getElementById('login-form') as HTMLFormElement;
const element_forgotPasswordForm = document.getElementById(
	'forgot-password-form',
) as HTMLFormElement;

let messageElement: HTMLElement | undefined = undefined;

// --- Utility Functions ---

/**
 * Reads a query‐param from the current URL.
 * @param name - The name of the parameter to read.
 * @returns The parameter's value, or null if not present.
 */
function getQueryParam(name: string): string | null {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(name);
}

/**
 * Toggles `.ready` vs `.unavailable` on a button depending on `isReady`.
 * @param btn - The button element to toggle classes on.
 * @param isReady - Boolean indicating if the button should be in a 'ready' state.
 */
function toggleButtonState(btn: HTMLElement, isReady: boolean): void {
	btn.classList.toggle('ready', isReady);
	btn.classList.toggle('unavailable', !isReady);
}

// --- Core Logic ---

/**
 * Creates a message <div> below a target element, with given classes.
 * Removes any existing message with the same ID first.
 * Sets ARIA attributes for accessibility.
 * @param id - The ID to assign to the new message element.
 * @param insertAfterId - The ID of an existing element to insert after.
 * @param initialClass - The CSS class to apply initially ('error' | 'success').
 * @returns The created HTMLElement or undefined on failure.
 */
function createMessageElement(
	id: string,
	insertAfterId: string,
	initialClass: 'error' | 'success',
	message: string,
): HTMLElement | undefined {
	const existingMsg = document.getElementById(id);
	if (existingMsg) existingMsg.remove();
	if (messageElement && messageElement.id === id) messageElement = undefined;

	const el = document.createElement('div');
	el.id = id;
	el.className = initialClass;
	el.setAttribute('role', 'alert');
	el.setAttribute('aria-live', initialClass === 'error' ? 'assertive' : 'polite');
	el.textContent = message;

	const anchorElement = document.getElementById(insertAfterId);
	if (anchorElement && anchorElement.parentNode) {
		anchorElement.parentNode.insertBefore(el, anchorElement.nextSibling);
	} else {
		console.error(
			`[DOM Error] Anchor element with ID '${insertAfterId}' not found for message insertion.`,
		);
		const visibleForm =
			element_loginForm && !element_loginForm.classList.contains('hidden')
				? element_loginForm
				: element_forgotPasswordForm;
		visibleForm.appendChild(el);
	}
	return el;
}

/**
 * Clears any currently displayed message element from the DOM.
 */
function clearMessage(): void {
	if (messageElement) {
		messageElement.remove();
		messageElement = undefined;
	}
}

/**
 * Updates the login submit button's state (ready/unavailable).
 */
function updateSubmitButton(): void {
	const isMessageBlocking = messageElement && messageElement.id === 'login-error-message';
	const isReady = !!(
		element_usernameInput.value.trim() &&
		element_passwordInput.value.trim() &&
		!isMessageBlocking
	);
	toggleButtonState(element_submitButton, isReady);
}

/**
 * Updates the forgot-password submit button's state (ready/unavailable).
 */
function updateForgotSubmitButton(): void {
	const isMessageBlocking = messageElement && messageElement.id === 'forgot-message';
	const isReady = !!(element_forgotEmailInput.value.trim() && !isMessageBlocking);
	toggleButtonState(element_forgotSubmitButton, isReady);
}

/**
 * Handles user input on username/password/forgot inputs.
 * Clears messages and updates button states accordingly.
 */
function handleInput(): void {
	clearMessage();
	updateSubmitButton();
	updateForgotSubmitButton();
}

/**
 * Shows the login form and hides the forgot-password form.
 * Manages ARIA attributes and focus.
 */
function showLoginForm(): void {
	clearMessage();

	element_loginForm.classList.remove('hidden');

	element_forgotPasswordForm.classList.add('hidden');

	element_forgotLink.classList.remove('hidden');
	element_backToLoginLink.classList.add('hidden');

	element_forgotEmailInput.value = '';

	element_usernameInput.focus();

	updateSubmitButton();
	updateForgotSubmitButton();
}

/**
 * Shows the forgot-password form and hides the login form.
 * Manages ARIA attributes and focus.
 */
function showForgotPasswordForm(): void {
	clearMessage();

	element_loginForm.classList.add('hidden');

	element_forgotPasswordForm.classList.remove('hidden');

	element_forgotLink.classList.add('hidden');
	element_backToLoginLink.classList.remove('hidden');

	element_usernameInput.value = '';
	element_passwordInput.value = '';

	element_forgotEmailInput.focus();

	updateSubmitButton();
	updateForgotSubmitButton();
}

/**
 * Sends a login request to the server.
 * @param username - The user's username (case preserved).
 * @param password - The user's plaintext password.
 */
async function sendLogin(username: string, password: string): Promise<void> {
	element_submitButton.disabled = true;
	toggleButtonState(element_submitButton, false);
	clearMessage();

	try {
		const response = await fetch('/auth', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'is-fetch-request': 'true' },
			credentials: 'same-origin',
			body: JSON.stringify({ username, password }),
		});

		const result = (await response.json()) as { message: string };

		if (response.ok) {
			// SUCCESS
			const redirectTo = getQueryParam('redirectTo');
			if (redirectTo) window.location.href = redirectTo;
			else window.location.href = `/member/${username.toLowerCase()}`;
		} else {
			// NOT OK
			messageElement = createMessageElement(
				'login-error-message',
				'password-input-line',
				'error',
				result.message,
			);
		}
	} catch (e: unknown) {
		console.error('Login fetch/processing error:', e);
		messageElement = createMessageElement(
			'login-error-message',
			'password-input-line',
			'error',
			translations['network-error'],
		);
	}

	element_submitButton.disabled = false;
	updateSubmitButton();
}

/**
 * Sends a forgot-password request to the server.
 * @param email - The email address to send password-reset instructions to.
 */
async function sendForgotPasswordRequest(email: string): Promise<void> {
	element_forgotSubmitButton.disabled = true;
	toggleButtonState(element_forgotSubmitButton, false);
	clearMessage();

	try {
		const response = await fetch('/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'is-fetch-request': 'true' },
			body: JSON.stringify({ email }),
		});

		const result = (await response.json()) as { message: string };

		if (response.ok)
			messageElement = createMessageElement(
				'forgot-message',
				'email-input-line',
				'success',
				result.message,
			);
		else
			messageElement = createMessageElement(
				'forgot-message',
				'email-input-line',
				'error',
				result.message,
			);
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error('Forgot password fetch/processing error:', errorMessage);
		messageElement = createMessageElement(
			'forgot-message',
			'email-input-line',
			'error',
			translations['network-error'],
		);
	}

	element_forgotSubmitButton.disabled = false;
	updateForgotSubmitButton();
}

// --- Script Entry Point ---

if (
	!element_usernameInput ||
	!element_passwordInput ||
	!element_forgotEmailInput ||
	!element_loginForm ||
	!element_forgotPasswordForm ||
	!element_submitButton ||
	!element_forgotSubmitButton ||
	!element_forgotLink ||
	!element_backToLoginLink
) {
	throw Error('Required input elements are missing from the DOM.');
}

// --- Event Listener Setup ---

element_usernameInput.addEventListener('input', handleInput);
element_passwordInput.addEventListener('input', handleInput);
element_forgotEmailInput.addEventListener('input', handleInput);

element_forgotLink.addEventListener('click', (event: MouseEvent): void => {
	event.preventDefault();
	showForgotPasswordForm();
});

element_backToLoginLink.addEventListener('click', (event: MouseEvent): void => {
	event.preventDefault();
	showLoginForm();
});
element_loginForm.addEventListener('submit', (event: SubmitEvent): void => {
	event.preventDefault();
	if (
		element_submitButton?.classList.contains('ready') &&
		(!messageElement || messageElement.id !== 'login-error-message')
	) {
		sendLogin(element_usernameInput.value, element_passwordInput.value);
	}
});
element_forgotPasswordForm.addEventListener('submit', (event: SubmitEvent): void => {
	event.preventDefault();
	if (element_forgotSubmitButton?.classList.contains('ready')) {
		if (element_forgotEmailInput.value.trim() !== '') {
			sendForgotPasswordRequest(element_forgotEmailInput.value);
		}
	}
});

// --- Initial Setup ---

updateSubmitButton();
updateForgotSubmitButton();
element_usernameInput.focus();
