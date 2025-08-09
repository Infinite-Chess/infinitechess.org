// src/client/scripts/esm/views/createaccount.js

// The script on the createaccount page


import languagedropdown from "../components/header/dropdowns/languagedropdown.js";
import { validatePassword } from '../util/password-validation.js';

const element_usernameInput = document.getElementById('username');
const element_emailInput = document.getElementById('email');
const element_passwordInput = document.getElementById('password');
const element_submitButton = document.getElementById('submit');

/** Default fetch options */
const fetchOptions = {
	headers: {
		"is-fetch-request": "true" // Custom header
	}
};

let usernameHasError = false;
element_usernameInput.addEventListener('input', () => { // When username field changes...
    
	// Test if the value of the username input field won't be accepted.

	// 3-25 characters in length.
	// Accepted characters: A-Z 0-9
	// Doesn't contain existing/reserved usernames.
	// Doesn't contain profain words.

	let usernameError = document.getElementById("usernameerror"); // Does an error already exist?

	const lengthError = element_usernameInput.value.length < 3;
	const formatError = !onlyLettersAndNumbers(element_usernameInput.value);

	// If ANY error, make sure errorElement is created
	if (lengthError || formatError) {
		if (!usernameError) { // Create empty errorElement
			usernameHasError = true;
			createErrorElement('usernameerror', "username-input-line");
			// Change input box to red outline
			element_usernameInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			usernameError = document.getElementById("usernameerror");
		}
	} else if (usernameError) { // No errors, delete that error element if it exists
		usernameHasError = false;
		usernameError.remove();
		element_usernameInput.removeAttribute('style');
	}
    
	if (lengthError && formatError) { // Change error message
		usernameError.textContent = translations["js-username_specs"];
	} else if (lengthError) {
		usernameError.textContent = translations["js-username_tooshort"];
	} else if (formatError) {
		usernameError.textContent = translations["js-username_wrongenc"];
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
			createErrorElement('usernameerror', "username-input-line");
			// Change input box to red outline
			element_usernameInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			const usernameError = document.getElementById("usernameerror");

			// translate the message from the server if a translation is available
			let result_message = result.reason;
			if (translations[result_message]) result_message = translations[result_message];
			usernameError.textContent = result_message;
			updateSubmitButton();
		});
});


let emailHasError = false;
element_emailInput.addEventListener('input', () => { // When email field changes...
    
	// Test if the email is a valid email format

	let emailError = document.getElementById("emailerror"); // Does an error already exist?

	const error = !validEmail(element_emailInput.value);

	// If ANY error, make sure errorElement is created
	if (error) {
		if (!emailError) { // Create empty errorElement
			emailHasError = true;
			createErrorElement('emailerror', 'emailinputline');
			// Change input box to red outline
			element_emailInput.style.outline = 'solid 1px red';
			// Reset variable because it now exists.
			emailError = document.getElementById("emailerror");
		}
	} else if (emailError) { // No errors, delete that error element if it exists
		emailHasError = false;
		emailError.remove();
		element_emailInput.removeAttribute('style');
	}
    
	if (error) {
		emailError.textContent = translations["js-email_invalid"];
	}

	updateSubmitButton();
});
element_emailInput.addEventListener('focusout', () => { // Check email availability and functionality...
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
					const emailError = document.getElementById("emailerror");

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
element_passwordInput.addEventListener('input', () => { // When password field changes...
	let passwordError = document.getElementById("passworderror");
	
	const validationResult = validatePassword(element_passwordInput.value);

	if (!validationResult.isValid) {
		passwordHasError = true;
		if (!passwordError) {
			passwordError = createErrorElement('passworderror', 'password-input-line');
			element_passwordInput.style.outline = 'solid 1px red';
		}
		// Use the error key from the result to get the correct translation
		passwordError.textContent = translations[validationResult.errorKey];
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

	if (!usernameHasError && !emailHasError && !passwordHasError
        && element_usernameInput.value
        && element_emailInput.value
        && element_passwordInput.value) sendForm(element_usernameInput.value, element_emailInput.value, element_passwordInput.value);
});

/**
 * Sends our form data to the createaccount route.
 * @param {string} username 
 * @param {string} email 
 * @param {string} password 
 */
function sendForm(username, email, password) {
	// Disable the button and set its class to unavailable immediately.
	element_submitButton.disabled = true;
	element_submitButton.className = 'unavailable';

	let OK = false;
	const config = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		credentials: 'same-origin', // Allows cookie to be set from this request
		body: JSON.stringify({username, email, password})
	};
	fetch('/createaccount', config)
		.then((response) => {
			if (response.ok) OK = true;
			return response.json();
		})
		.then((result) => {
			if (OK) { // Account created!
				// We also received the refresh token cookie to start a session.
				// token = docutil.getCookieValue('token') // Cookie expires in 60s
				window.location.href = languagedropdown.addLngQueryParamToLink(`/member/${username.toLowerCase()}`);
			} else { // Conflict, unable to make account. 409 CONFLICT
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

function createErrorElement(id, insertAfter) {
	const errElement = document.createElement('div');
	errElement.className = 'error';
	errElement.id = id;
	// The element now looks like this:
	// <div class="error" id="usernameerror"></div>
	document.getElementById(insertAfter).insertAdjacentElement('afterend', errElement);
	return errElement; // Return the created element
}

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
function updateSubmitButton() {
	if (usernameHasError || emailHasError || passwordHasError
        || !element_usernameInput.value
        || !element_emailInput.value
        || !element_passwordInput.value) {
		element_submitButton.className = 'unavailable';
	} else { // No Errors
		element_submitButton.className = 'ready';
	}
}

function onlyLettersAndNumbers(string) {
	if (!string) return true;
	return /^[a-zA-Z0-9]+$/.test(string);
}

function validEmail(string) {
	// Credit for the regex: https://stackoverflow.com/a/201378
	// eslint-disable-next-line no-control-regex
	const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
	if (regex.test(string) === true) return true;
	return false;
}