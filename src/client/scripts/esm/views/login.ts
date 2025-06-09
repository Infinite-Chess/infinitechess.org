// login.ts

// --- Interfaces for API Responses ---
interface ErrorResponse {
	type: 'error';
	message: string;
}

interface LoginSuccessResponseData {
	type: 'loginSuccess';
}

interface ForgotPasswordSuccessData {
	type: 'forgotPasswordSuccess';
	message: string;
}

type SuccessPayload = LoginSuccessResponseData | ForgotPasswordSuccessData;
type ApiPayload = SuccessPayload | ErrorResponse;

interface FetchResponse<T> {
	ok: boolean;
	status: number;
	payload: T;
}

// --- Utility Functions ---

/**
 * Type guard to check if the response payload is an ErrorResponse.
 * It checks the 'ok' status of the response and the 'type' property of the payload.
 * @param resp - The fetch response object, where payload is expected to be ApiPayload.
 * @returns True if the response indicates an error, false otherwise.
 */
function isErrorResponse(resp: FetchResponse<ApiPayload>): resp is FetchResponse<ErrorResponse> {
	return !resp.ok || resp.payload.type === 'error';
}

/**
 * Safely queries an element by its ID and optionally casts it.
 * @param id - The ID of the element to query.
 * @returns The HTMLElement or null if not found.
 */
function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

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
function toggleButtonState(btn: HTMLElement | null, isReady: boolean): void {
	if (btn) {
		btn.classList.toggle('ready', isReady);
		btn.classList.toggle('unavailable', !isReady);
	}
}

/**
 * Safely focuses an element if it exists.
 * @param el - The HTMLElement to focus.
 */
function focusIf(el: HTMLElement | null): void {
	if (el) {
		el.focus();
	}
}

// --- Element Selectors ---
const element_usernameInput = $<HTMLInputElement>('username');
const element_passwordInput = $<HTMLInputElement>('password');
const element_submitButton = $<HTMLInputElement>('submit');

const element_forgotLink = $<HTMLAnchorElement>('forgot-link');
const element_backToLoginLink = $<HTMLAnchorElement>('back-to-login-link');

const element_forgotEmailInput = $<HTMLInputElement>('forgot-email');
const element_forgotSubmitButton = $<HTMLInputElement>('forgot-submit');

const element_loginForm = $<HTMLFormElement>('login-form');
const element_forgotPasswordForm = $<HTMLFormElement>('forgot-password-form');

let messageElement: HTMLElement | undefined = undefined;

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
function createMessageElement(id: string, insertAfterId: string, initialClass: 'error' | 'success'): HTMLElement | undefined {
	const existingMsg = $(id);
	if (existingMsg) {
		existingMsg.remove();
	}
	if (messageElement && messageElement.id === id) {
		messageElement = undefined;
	}

	const el = document.createElement('div');
	el.id = id;
	el.className = initialClass;
	el.setAttribute('role', 'alert');
	el.setAttribute('aria-live', initialClass === 'error' ? 'assertive' : 'polite');

	const anchorElement = $(insertAfterId);
	if (anchorElement && anchorElement.parentNode) {
		anchorElement.parentNode.insertBefore(el, anchorElement.nextSibling);
		return el;
	} else {
		console.error(`[DOM Error] Anchor element with ID '${insertAfterId}' not found for message insertion.`);
		const visibleForm = element_loginForm && !element_loginForm.classList.contains('hidden') ? element_loginForm : element_forgotPasswordForm;
		if (visibleForm) {
			visibleForm.appendChild(el);
			return el;
		}
	}
	return undefined;
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
	if (element_submitButton && element_usernameInput && element_passwordInput) {
		const isMessageBlocking = messageElement && messageElement.id === 'login-error-message';
		const isReady = !!(element_usernameInput.value.trim() && element_passwordInput.value.trim() && !isMessageBlocking);
		toggleButtonState(element_submitButton, isReady);
	}
}

/**
 * Updates the forgot-password submit button's state (ready/unavailable).
 */
function updateForgotSubmitButton(): void {
	if (element_forgotSubmitButton && element_forgotEmailInput) {
		const isMessageBlocking = messageElement && messageElement.id === 'forgot-message';
		const isReady = !!(element_forgotEmailInput.value.trim() && !isMessageBlocking);
		toggleButtonState(element_forgotSubmitButton, isReady);
	}
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
	if (element_loginForm) {
		element_loginForm.classList.remove('hidden');
		element_loginForm.removeAttribute('aria-hidden');
	}
	if (element_forgotPasswordForm) {
		element_forgotPasswordForm.classList.add('hidden');
		element_forgotPasswordForm.setAttribute('aria-hidden', 'true');
	}

	if (element_forgotLink) element_forgotLink.classList.remove('hidden');
	if (element_backToLoginLink) element_backToLoginLink.classList.add('hidden');
	
	if (element_forgotEmailInput) element_forgotEmailInput.value = '';
	focusIf(element_usernameInput);
	
	updateSubmitButton();
	updateForgotSubmitButton();
}

/**
 * Shows the forgot-password form and hides the login form.
 * Manages ARIA attributes and focus.
 */
function showForgotPasswordForm(): void {
	clearMessage();
	if (element_loginForm) {
		element_loginForm.classList.add('hidden');
		element_loginForm.setAttribute('aria-hidden', 'true');
	}
	if (element_forgotPasswordForm) {
		element_forgotPasswordForm.classList.remove('hidden');
		element_forgotPasswordForm.removeAttribute('aria-hidden');
	}

	if (element_forgotLink) element_forgotLink.classList.add('hidden');
	if (element_backToLoginLink) element_backToLoginLink.classList.remove('hidden');
	
	if (element_usernameInput) element_usernameInput.value = '';
	if (element_passwordInput) element_passwordInput.value = '';
	
	focusIf(element_forgotEmailInput);
	updateSubmitButton();
	updateForgotSubmitButton();
}

/**
 * Sends a login request to the server.
 * @param username - The user's username (case preserved).
 * @param password - The user's plaintext password.
 */
function sendLogin(username: string, password: string): void {
	if (element_submitButton) element_submitButton.disabled = true;
	clearMessage();

	const config: RequestInit = {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'is-fetch-request': 'true' },
		credentials: 'same-origin',
		body: JSON.stringify({ username, password })
	};

	fetch('/auth', config)
		.then(async(response: Response): Promise<FetchResponse<ApiPayload>> => {
			const payload = await response.json().catch(() => ({ type: 'error', message: 'Invalid JSON response from server.' }) as ErrorResponse);
			return { ok: response.ok, status: response.status, payload };
		})
		.then((resp: FetchResponse<ApiPayload>): void => {
			if (isErrorResponse(resp)) {
				messageElement = createMessageElement('login-error-message', 'password-input-line', 'error');
				if (messageElement) {
					const message = (resp.payload && typeof resp.payload.message === 'string') 
						? resp.payload.message 
						: `Login failed (Status: ${resp.status})`;
					messageElement.textContent = message;
				}
			} else {
				const redirectTo = getQueryParam('redirectTo');
				if (redirectTo) {
					window.location.href = redirectTo;
				} else {
					window.location.href = `/member/${username.toLowerCase()}`;
				}
			}
		})
		.catch((error: Error) => {
			console.error('Login fetch/processing error:', error);
			messageElement = createMessageElement('login-error-message', 'password-input-line', 'error');
			if (messageElement) messageElement.textContent = 'A network or processing error occurred. Please try again.';
		})
		.finally(() => {
			if (element_submitButton) element_submitButton.disabled = false;
			updateSubmitButton();
		});
}

/**
 * Sends a forgot-password request to the server.
 * @param email - The email address to send password-reset instructions to.
 */
function sendForgotPasswordRequest(email: string): void {
	if (element_forgotSubmitButton) element_forgotSubmitButton.disabled = true;
	clearMessage();

	const config: RequestInit = {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'is-fetch-request': 'true' },
		body: JSON.stringify({ email })
	};

	fetch('/forgot-password', config)
		.then(async(response: Response): Promise<FetchResponse<ApiPayload>> => {
			const payload = await response.json().catch(() => ({ type: 'error', message: 'Invalid JSON response from server.' }) as ErrorResponse);
			return { ok: response.ok, status: response.status, payload };
		})
		.then((resp: FetchResponse<ApiPayload>): void => {
			if (isErrorResponse(resp)) {
				messageElement = createMessageElement('forgot-message', 'email-input-line', 'error');
				if (messageElement) {
					const message = (resp.payload && typeof resp.payload.message === 'string') 
						? resp.payload.message 
						: `Request failed (Status: ${resp.status})`;
					messageElement.textContent = message;
				}
			} else {
				const successPayload = resp.payload as ForgotPasswordSuccessData;
				messageElement = createMessageElement('forgot-message', 'email-input-line', 'success');
				if (messageElement) messageElement.textContent = successPayload.message;
			}
		})
		.catch((error: Error) => {
			console.error('Forgot password fetch/processing error:', error);
			messageElement = createMessageElement('forgot-message', 'email-input-line', 'error');
			if (messageElement) messageElement.textContent = 'A network or processing error occurred. Please try again.';
		})
		.finally(() => {
			if (element_forgotSubmitButton) element_forgotSubmitButton.disabled = false;
			updateForgotSubmitButton();
		});
}

// --- Event Listener Setup ---

if (element_usernameInput) element_usernameInput.addEventListener('input', handleInput);
if (element_passwordInput) element_passwordInput.addEventListener('input', handleInput);
if (element_forgotEmailInput) element_forgotEmailInput.addEventListener('input', handleInput);

if (element_forgotLink) {
	element_forgotLink.addEventListener('click', (event: MouseEvent): void => {
		event.preventDefault();
		showForgotPasswordForm();
	});
}
if (element_backToLoginLink) {
	element_backToLoginLink.addEventListener('click', (event: MouseEvent): void => {
		event.preventDefault();
		showLoginForm();
	});
}

if (element_loginForm) {
	element_loginForm.addEventListener('submit', (event: SubmitEvent): void => {
		event.preventDefault();
		if (element_submitButton?.classList.contains('ready') && (!messageElement || messageElement.id !== 'login-error-message')) {
			if (element_usernameInput && element_passwordInput) {
				sendLogin(element_usernameInput.value, element_passwordInput.value);
			}
		}
	});
}
if (element_forgotPasswordForm) {
	element_forgotPasswordForm.addEventListener('submit', (event: SubmitEvent): void => {
		event.preventDefault();
		if (element_forgotSubmitButton?.classList.contains('ready')) {
			if (element_forgotEmailInput && element_forgotEmailInput.value.trim() !== '') {
				sendForgotPasswordRequest(element_forgotEmailInput.value);
			}
		}
	});
}

window.addEventListener('load', (): void => {
	updateSubmitButton();
	updateForgotSubmitButton();
	if (element_loginForm && !element_loginForm.classList.contains('hidden')) {
		focusIf(element_usernameInput);
		element_loginForm.removeAttribute('aria-hidden');
		if (element_forgotPasswordForm) element_forgotPasswordForm.setAttribute('aria-hidden', 'true');
	} else if (element_forgotPasswordForm && !element_forgotPasswordForm.classList.contains('hidden')) {
		focusIf(element_forgotEmailInput);
		element_forgotPasswordForm.removeAttribute('aria-hidden');
		if (element_loginForm) element_loginForm.setAttribute('aria-hidden', 'true');
	} else {
		focusIf(element_usernameInput);
		if (element_loginForm) element_loginForm.removeAttribute('aria-hidden');
		if (element_forgotPasswordForm) element_forgotPasswordForm.setAttribute('aria-hidden', 'true');
	}
});

export {};