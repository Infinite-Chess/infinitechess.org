// src/client/scripts/esm/views/resetpassword.ts

/**
 * This script handles the client-side logic for the password reset page.
 * It validates user input for a new password and sends it to the server.
 */

// Import the shared password validation utility.
import { validatePassword } from '../util/password-validation';

// --- Type Definitions for Clarity ---
type FormElements = {
	form: HTMLFormElement;
	newPasswordInput: HTMLInputElement;
	confirmPasswordInput: HTMLInputElement;
	submitButton: HTMLInputElement;
};

// --- Helper Functions (at module scope) ---

/**
 * Extracts the password reset token from the page's URL.
 */
function getTokenFromUrl(): string {
	const pathSegments = window.location.pathname.split('/');
	return pathSegments[pathSegments.length - 1] || '';
}

/**
 * Creates or updates a message element on the page.
 */
function createMessageElement(id: string, insertAfterId: string, initialClass: 'error' | 'success'): HTMLElement {
	const existingEl = document.getElementById(id);
	if (existingEl) existingEl.remove();
	
	const el = document.createElement('div');
	el.id = id;
	el.className = initialClass;
	document.getElementById(insertAfterId)?.insertAdjacentElement('afterend', el);
	return el;
}

/**
 * The main setup function that attaches all logic and event listeners.
 * This function only runs if all required DOM elements are found.
 * @param elements - An object containing the verified DOM elements.
 */
function initializeForm(elements: FormElements): void {
	const { form, newPasswordInput, confirmPasswordInput, submitButton } = elements;
	
	let messageElement: HTMLElement | null = null;
	let isSubmitting: boolean = false;
	const token = getTokenFromUrl();

	function clearMessage(): void {
		if (messageElement) {
			messageElement.remove();
			messageElement = null;
		}
	}

	function updateSubmitButtonState(): void {
		if (isSubmitting) return;
		clearMessage();
		if (newPasswordInput.value && confirmPasswordInput.value) {
			submitButton.disabled = false;
			submitButton.className = 'ready';
		} else {
			submitButton.disabled = true;
			submitButton.className = 'unavailable';
		}
	}

	function validateForm(): boolean {
		const password = newPasswordInput.value;
		const confirmPassword = confirmPasswordInput.value;

		const validationResult = validatePassword(password);
		if (!validationResult.isValid && validationResult.errorKey) {
			// const errorMessage = translations[validationResult.errorKey] || 'Invalid password.';
			const errorMessage = 'Invalid password format.'; // Placeholder
			messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
			messageElement.textContent = errorMessage;
			newPasswordInput.focus();
			return false;
		}

		if (password !== confirmPassword) {
			// const errorMessage = translations['js-pwd_no_match'] || 'Passwords do not match.';
			const errorMessage = 'Passwords do not match.'; // Placeholder
			messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
			messageElement.textContent = errorMessage;
			confirmPasswordInput.focus();
			return false;
		}
		return true;
	}

	async function handleResetSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (isSubmitting || !validateForm()) return;

		isSubmitting = true;
		submitButton.disabled = true;
		submitButton.value = 'Processing...';

		try {
			const response = await fetch('/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'is-fetch-request': 'true', // Custom header
				},
				body: JSON.stringify({ token, password: newPasswordInput.value }) 
			});

			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'An unknown error occurred.');

			form.innerHTML = `<p class="success">${result.message}</p>`;
			setTimeout(() => { window.location.href = '/login'; }, 4000);

		} catch (error: unknown) {
			messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
			const errorMessage = error instanceof Error ? error.message : 'A network error occurred.';
			messageElement.textContent = errorMessage;
			
			isSubmitting = false; 
			submitButton.disabled = false;
			submitButton.value = 'Reset Password';
		}
	}

	// --- Event Listeners & Initial Setup ---
	newPasswordInput.addEventListener('input', updateSubmitButtonState);
	confirmPasswordInput.addEventListener('input', updateSubmitButtonState);
	form.addEventListener('submit', handleResetSubmit);
	updateSubmitButtonState();
}


// --- Script Entry Point ---
// [FIX] Use instanceof for safe type checking instead of unsafe 'as' casting.
const formEl = document.getElementById('reset-form');
const newPasswordEl = document.getElementById('new-password');
const confirmPasswordEl = document.getElementById('confirm-password');
const submitButtonEl = document.getElementById('submit-reset');

if (
	formEl instanceof HTMLFormElement &&
	newPasswordEl instanceof HTMLInputElement &&
	confirmPasswordEl instanceof HTMLInputElement &&
	submitButtonEl instanceof HTMLInputElement
) {
	// If all elements are found and are of the correct type, initialize the form logic.
	initializeForm({
		form: formEl,
		newPasswordInput: newPasswordEl,
		confirmPasswordInput: confirmPasswordEl,
		submitButton: submitButtonEl,
	});
} else {
	console.error('One or more required elements for the reset password form are missing or of the wrong type.');
}