// src/client/scripts/esm/views/resetpassword.ts

/**
 * This script handles the client-side logic for the password reset page.
 * It validates user input for a new password and sends it to the server.
 */

// Import the shared password validation utility
import { validatePassword } from '../util/password-validation.js'; // Adjust path as needed


/**
 * Creates or updates a message element on the page.
 * @param id The ID for the message element.
 * @param insertAfterId The ID of the element after which this message should be inserted.
 * @param initialClass The initial CSS class ('error' or 'success').
 * @returns The created HTML element.
 */
function createMessageElement(id: string, insertAfterId: string, initialClass: 'error' | 'success'): HTMLElement {
	// Remove existing message element if it exists
	const existingEl = document.getElementById(id);
	if (existingEl) {
		existingEl.remove();
	}
	
	const el = document.createElement('div');
	el.id = id;
	el.className = initialClass;
	document.getElementById(insertAfterId)?.insertAdjacentElement('afterend', el);
	return el;
}

// --- DOM Element Selection ---
const form = document.getElementById('reset-form') as HTMLFormElement;
const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;
const submitButton = document.getElementById('submit-reset') as HTMLInputElement;

// --- Main Logic ---
let messageElement: HTMLElement | null = null;
const token = getTokenFromUrl();

if (form && newPasswordInput && confirmPasswordInput && submitButton) {
	// --- Event Listeners ---
	newPasswordInput.addEventListener('input', updateSubmitButtonState);
	confirmPasswordInput.addEventListener('input', updateSubmitButtonState);
	form.addEventListener('submit', handleResetSubmit);

	// Initial state check
	updateSubmitButtonState();
} else {
	console.error('One or more required elements for the reset password form are missing.');
}

/**
 * Extracts the password reset token from the page's URL.
 */
function getTokenFromUrl(): string {
	const pathSegments = window.location.pathname.split('/');
	return pathSegments[pathSegments.length - 1] || '';
}

/**
 * Clears any displayed error or success message.
 */
function clearMessage(): void {
	if (messageElement) {
		messageElement.remove();
		messageElement = null;
	}
}

/**
 * Updates the state of the submit button based on input validity.
 */
function updateSubmitButtonState(): void {
	clearMessage();
	if (newPasswordInput.value && confirmPasswordInput.value) {
		submitButton.disabled = false;
		submitButton.className = 'ready';
	} else {
		submitButton.disabled = true;
		submitButton.className = 'unavailable';
	}
}

/**
 * Handles the form submission to reset the user's password.
 */
async function handleResetSubmit(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	clearMessage();

	const password = newPasswordInput.value;
	const confirmPassword = confirmPasswordInput.value;

	// --- Client-side Validation ---
	const validationResult = validatePassword(password);
	if (!validationResult.isValid && validationResult.errorKey) {
		const errorMessage = translations[validationResult.errorKey];
		messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
		messageElement.textContent = errorMessage;
		return;
	}

	if (password !== confirmPassword) {
		const errorMessage = translations['js-pwd_no_match'];
		messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
		messageElement.textContent = errorMessage;
		return;
	}

	submitButton.disabled = true;
	submitButton.value = 'Processing...';

	// --- API Call ---
	try {
		const response = await fetch('/reset-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				"is-fetch-request": "true" // Custom header
			},
			body: JSON.stringify({
				token,
				password: password
			})
		});

		const result = await response.json();

		if (!response.ok) {
			throw new Error(result.message || 'An unknown error occurred.');
		}

		// --- Handle Success ---
		form.innerHTML = `<p class="success">${result.message}</p>`;
		setTimeout(() => {
			window.location.href = '/login';
		}, 4000);

	} catch (error: unknown) {
		// --- Handle Failure ---
		messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
		const errorMessage = error instanceof Error ? error.message : 'A network error occurred.';
		messageElement.textContent = errorMessage;
		
		// Re-enable the button on failure
		submitButton.disabled = false;
		submitButton.value = 'Reset Password';
	}
}