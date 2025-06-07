

// Helper function to create and manage the message element
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
// We use type assertions to tell TypeScript what kind of element these are.
const form = document.getElementById('reset-form') as HTMLFormElement | null;
const newPasswordInput = document.getElementById('new-password') as HTMLInputElement | null;
const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement | null;
const submitButton = document.getElementById('submit-reset') as HTMLInputElement | null;

// --- Main Logic ---
if (form && newPasswordInput && confirmPasswordInput && submitButton) {
	let messageElement: HTMLElement | null = null;

	/**
	 * Extracts the password reset token from the page's URL.
	 * @returns The token string or an empty string if not found.
	 */
	const getTokenFromUrl = (): string => {
		const pathSegments = window.location.pathname.split('/');
		// Assumes URL is /reset-password/TOKEN
		return pathSegments[pathSegments.length - 1] || '';
	};

	const token = getTokenFromUrl();

	/**
	 * Clears any displayed error or success message.
	 */
	const clearMessage = (): void => {
		if (messageElement) {
			messageElement.remove();
			messageElement = null;
		}
	};

	/**
	 * Updates the state of the submit button based on input validity.
	 */
	const updateSubmitButtonState = (): void => {
		clearMessage();
		// A simple check: enable if both fields have some content.
		if (newPasswordInput.value && confirmPasswordInput.value) {
			submitButton.disabled = false;
			submitButton.className = 'ready';
		} else {
			submitButton.disabled = true;
			submitButton.className = 'unavailable';
		}
	};

	/**
	 * Handles the form submission to reset the user's password.
	 * @param event - The form submission event.
	 */
	const handleResetSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		clearMessage();

		const password = newPasswordInput.value;
		const confirmPassword = confirmPasswordInput.value;

		// --- Client-side Validation ---
		if (password.length < 8) { // Match your backend validation rule
			messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
			messageElement.textContent = 'Password must be at least 8 characters long.';
			return;
		}
		if (password !== confirmPassword) {
			messageElement = createMessageElement('reset-message', 'confirm-password-line', 'error');
			messageElement.textContent = 'Passwords do not match.';
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
					token: token,
					password: password
				})
			});

			const result = await response.json();

			if (!response.ok) {
				// The API returned an error (e.g., 400 or 500)
				throw new Error(result.message || 'An unknown error occurred.');
			}

			// --- Handle Success ---
			// Replace the form content with a success message and redirect.
			form.innerHTML = `<p class="success">${result.message} You will be redirected to the login page shortly.</p>`;
			setTimeout(() => {
				window.location.href = '/login'; // Redirect to login page
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
	};

	// --- Event Listeners ---
	newPasswordInput.addEventListener('input', updateSubmitButtonState);
	confirmPasswordInput.addEventListener('input', updateSubmitButtonState);
	form.addEventListener('submit', handleResetSubmit);

	// Initial state check
	updateSubmitButtonState();
} else {
	console.error('One or more required elements for the reset password form are missing.');
}