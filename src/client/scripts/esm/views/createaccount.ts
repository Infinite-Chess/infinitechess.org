// src/client/scripts/esm/views/createaccount.ts

// The script on the createaccount page

import validators from '../../../../shared/util/validators.js';
import languagedropdown from '../components/header/dropdowns/languagedropdown.js';

const element_usernameInput = document.getElementById('username') as HTMLInputElement;
const element_emailInput = document.getElementById('email') as HTMLInputElement;
const element_passwordInput = document.getElementById('password') as HTMLInputElement;
const element_submitButton = document.getElementById('submit') as HTMLButtonElement;

/** Default fetch options */
const fetchOptions: RequestInit = {
	headers: {
		'is-fetch-request': 'true', // Custom header
	},
};

let usernameHasError = false;
element_usernameInput.addEventListener('input', () => {
	// When username field changes...

	// Test if the value of the username input field won't be accepted.

	// 3-25 characters in length.
	// Accepted characters: A-Z 0-9
	// Doesn't contain existing/reserved usernames.
	// Doesn't contain profain words.

	let usernameError = document.getElementById('usernameerror')!; // Does an error already exist?

	const result = validators.validateUsername(element_usernameInput.value);

	// If ANY error, make sure errorElement is created
	if (result !== validators.UsernameValidationResult.Ok) {
		if (!usernameError) {
			// Create empty errorElement
			usernameHasError = true;
			createErrorElement('usernameerror', 'username-input-line');
			// Change input box to red outline
			element_usernameInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			usernameError = document.getElementById('usernameerror')!;
		}
		usernameError.textContent = translations[validators.getUsernameErrorTranslation(result)!];
	} else if (usernameError) {
		// No errors, delete that error element if it exists
		usernameHasError = false;
		usernameError.remove();
		element_usernameInput.removeAttribute('style');
	}

	updateSubmitButton();
});
element_usernameInput.addEventListener('focusout', () => {
	// Check username availability...
	if (element_usernameInput.value.length === 0 || usernameHasError) return;

	fetch(`/createaccount/username/${element_usernameInput.value}`, fetchOptions)
		.then((response) => response.json())
		.then((result) => {
			// { allowed, reason }
			// We've got the result back from the server,
			// Is this username available to use?
			if (result.allowed === true) return; // Not in use

			// ERROR! In use!
			usernameHasError = true;
			createErrorElement('usernameerror', 'username-input-line');
			// Change input box to red outline
			element_usernameInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			const usernameError = document.getElementById('usernameerror')!;

			// translate the message from the server if a translation is available
			let result_message = result.reason;
			if (translations[result_message]) result_message = translations[result_message];
			usernameError.textContent = result_message;
			updateSubmitButton();
		});
});

let emailHasError = false;
element_emailInput.addEventListener('input', () => {
	// When email field changes...

	// Test if the email is a valid email format

	let emailError = document.getElementById('emailerror'); // Does an error already exist?

	const result = validators.validateEmail(element_emailInput.value);

	// If ANY error, make sure errorElement is created
	if (result !== validators.EmailValidationResult.Ok) {
		if (!emailError) {
			// Create empty errorElement
			emailHasError = true;
			createErrorElement('emailerror', 'emailinputline');
			// Change input box to red outline
			element_emailInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			emailError = document.getElementById('emailerror')!;
		}
		emailError.textContent = translations[validators.getEmailErrorTranslation(result)!];
	} else if (emailError) {
		// No errors, delete that error element if it exists
		emailHasError = false;
		emailError.remove();
		element_emailInput.removeAttribute('style');
	}

	updateSubmitButton();
});
element_emailInput.addEventListener('focusout', () => {
	// Check email availability and functionality...
	// If it's blank, all the server would send back is the createaccount.html again..
	if (element_emailInput.value.length > 1 && !emailHasError) {
		fetch(`/createaccount/email/${element_emailInput.value}`, fetchOptions)
			.then((response) => response.json())
			.then((result) => {
				// We've got the result back from the server,
				// Is anything wrong?
				if (result.valid === false) {
					// There has been an error
					emailHasError = true;

					// We create the error text
					createErrorElement('emailerror', 'emailinputline');

					// Change input box to red outline
					element_emailInput.style.outline = 'solid 1px red';

					// Reset variable because it now exists.
					const emailError = document.getElementById('emailerror')!;

					// The error message from the server is already language-localized
					emailError.textContent = result.reason;

					updateSubmitButton();
				} else {
					emailHasError = false;
					updateSubmitButton();
				}
			});
	}
});

let passwordHasError = false;
element_passwordInput.addEventListener('input', () => {
	// When password field changes...
	let passwordError = document.getElementById('passworderror');

	const result = validators.validatePassword(element_passwordInput.value);

	if (result !== validators.PasswordValidationResult.Ok) {
		passwordHasError = true;
		if (!passwordError) {
			passwordError = createErrorElement('passworderror', 'password-input-line');
			element_passwordInput.style.outline = 'solid 1px red';
		}
		passwordError.textContent = translations[validators.getPasswordErrorTranslation(result)!];
	} else {
		passwordHasError = false;
		if (passwordError) {
			passwordError.remove();
		}
		element_passwordInput.removeAttribute('style');
	}

	updateSubmitButton();
});

element_submitButton.addEventListener('click', (event) => {
	event.preventDefault();

	if (
		!usernameHasError &&
		!emailHasError &&
		!passwordHasError &&
		element_usernameInput.value &&
		element_emailInput.value &&
		element_passwordInput.value
	)
		sendForm(
			element_usernameInput.value,
			element_emailInput.value,
			element_passwordInput.value,
		);
});

/** Sends our form data to the createaccount route. */
function sendForm(username: string, email: string, password: string): void {
	// Disable the button and set its class to unavailable immediately.
	element_submitButton.disabled = true;
	element_submitButton.className = 'unavailable';

	let OK = false;
	const config: RequestInit = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'is-fetch-request': 'true', // Custom header
		},
		credentials: 'same-origin', // Allows cookie to be set from this request
		body: JSON.stringify({ username, email, password }),
	};
	fetch('/createaccount', config)
		.then((response) => {
			if (response.ok) OK = true;
			return response.json();
		})
		.then((_result) => {
			if (OK) {
				// Account created!
				// We also received the refresh token cookie to start a session.
				// token = docutil.getCookieValue('token') // Cookie expires in 60s
				window.location.href = languagedropdown.addLngQueryParamToLink(
					`/member/${username.toLowerCase()}`,
				);
			} else {
				// Conflict, unable to make account. 409 CONFLICT
				window.location.href = languagedropdown.addLngQueryParamToLink('/409');
			}
		})
		// Re-enable the button after the fetch is done.
		// CURRENTLY ONLY RUNS WHEN a network error occurs, as for all server responses we redirect the page.
		.finally(() => {
			element_submitButton.disabled = false;
			// Call updateSubmitButton() to correctly set the class to 'ready' or 'unavailable'
			// based on the current state of the form fields.
			updateSubmitButton();
		});
}

function createErrorElement(id: string, insertAfter: string): HTMLElement {
	const errElement = document.createElement('div');
	errElement.className = 'error';
	errElement.id = id;
	// The element now looks like this:
	// <div class="error" id="usernameerror"></div>
	document.getElementById(insertAfter)!.insertAdjacentElement('afterend', errElement);
	return errElement; // Return the created element
}

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
function updateSubmitButton(): void {
	if (
		usernameHasError ||
		emailHasError ||
		passwordHasError ||
		!element_usernameInput.value ||
		!element_emailInput.value ||
		!element_passwordInput.value
	) {
		element_submitButton.className = 'unavailable';
	} else {
		// No Errors
		element_submitButton.className = 'ready';
	}
}
