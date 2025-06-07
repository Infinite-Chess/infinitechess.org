
const element_usernameInput = document.getElementById('username');
const element_passwordInput = document.getElementById('password');
const element_submitButton = document.getElementById('submit');

// New elements for form switching
const element_loginContainer = document.getElementById('login-form-container');
const element_forgotContainer = document.getElementById('forgot-form-container');
const element_forgotLink = document.getElementById('forgot-link');
const element_backToLoginLink = document.getElementById('back-to-login-link');

// New elements for the forgot password form
const element_forgotEmailInput = document.getElementById('forgot-email');
const element_forgotSubmitButton = document.getElementById('forgot-submit');

// Keep track of the error/message element
let messageElement = undefined;



//Event Listeners
element_usernameInput.addEventListener('input', handleInput); // When username field changes...
element_passwordInput.addEventListener('input', handleInput); // When username field changes...
element_forgotEmailInput.addEventListener('input', handleInput); // Also clear messages when typing email

// Checks for autofilled inputs on load
window.addEventListener('load', (event) => {
	if (element_usernameInput.value && element_passwordInput.value) {
		updateSubmitButton();
		updateForgotSubmitButton();
	}
});

// Listener for the main LOGIN button
element_submitButton.addEventListener('click', (event) => {
	event.preventDefault();
	if (element_usernameInput.value && element_passwordInput.value && !messageElement) {
		sendLogin(element_usernameInput.value, element_passwordInput.value);
	}
});

// Listener for the "Forgot Password?" link
element_forgotLink.addEventListener('click', (event) => {
	event.preventDefault();
	showForgotPasswordForm();
});

// Listener for the "Back to Login" link
element_backToLoginLink.addEventListener('click', (event) => {
	event.preventDefault();
	showLoginForm();
});

// Listener for the "Send Reset Link" button
element_forgotSubmitButton.addEventListener('click', (event) => {
	event.preventDefault();
	if (element_forgotEmailInput.value) {
		sendForgotPasswordRequest(element_forgotEmailInput.value);
	}
});

// Renamed from handleInput for clarity
function clearMessage() {
	if (messageElement) {
		messageElement.remove();
		messageElement = undefined;
	}
}

function handleInput() {
	clearMessage();
	updateSubmitButton();
	updateForgotSubmitButton();
}

// Function to switch views
function showLoginForm() {
	clearMessage();
	element_loginContainer.classList.remove('hidden');
	element_forgotContainer.classList.add('hidden');
	element_forgotLink.classList.remove('hidden');
	element_backToLoginLink.classList.add('hidden');
}

function showForgotPasswordForm() {
	clearMessage();
	element_loginContainer.classList.add('hidden');
	element_forgotContainer.classList.remove('hidden');
	element_forgotLink.classList.add('hidden');
	element_backToLoginLink.classList.remove('hidden');
	element_usernameInput.value = ''; // Clear login form fields
	element_passwordInput.value = '';
}

const sendLogin = (username, password) => {
	element_submitButton.disabled = true;

	let OK = false;
	const config = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		credentials: 'same-origin', // Allows cookie to be set from this request
		body: JSON.stringify({username, password})
	};
	fetch('/auth', config)
		.then((response) => {
			if (response.ok) OK = true;
			return response.json();
		})
		.then((result) => {
			if (OK) { // Username & password accepted! Handle our access token
				// const token = docutil.getCookieValue('token')

				// Check for a redirectTo query parameter, and if it exists, use it
				const redirectTo = getQueryParam('redirectTo');
				if (redirectTo) window.location.href = redirectTo;
				else window.location.href = `/member/${username.toLowerCase()}`;

			} else { // Unauthorized, create error with the message contained in response body
				if (!messageElement) {
					// The function already returns the new element, so just assign it directly.
					messageElement = createMessageElement('loginerror', 'password-input-line', 'error'); 
				}
				updateSubmitButton();

				messageElement.textContent = result.message;
				element_submitButton.disabled = false;
			}
		});
};


const sendForgotPasswordRequest = (email) => {
	element_forgotSubmitButton.disabled = true;
	element_forgotSubmitButton.className = 'unavailable';
	clearMessage(); // Clear previous messages

	const config = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		body: JSON.stringify({ email })
	};

	fetch('/forgot-password', config)
		.then(response => {
			// Check if the response was successful (e.g., status 200)
			const isOk = response.ok;
			return response.json().then(data => ({ isOk, data })); // Pass both along
		})
		.then(({ isOk, data }) => {
			// Now you can check the status and use the data
			if (isOk) {
				console.log("OKAY");
				messageElement = createMessageElement('forgot-message', 'email-input-line', 'success');
			} else {
				console.log("NOT OKAY");
				messageElement = createMessageElement('forgot-message', 'email-input-line', 'error');
			}
			messageElement.textContent = data.message;
		})
		.catch(err => {
			console.error('Fetch error:', err);
			messageElement = createMessageElement('forgot-message', 'email-input-line', 'error');
			messageElement.textContent = 'A network error occurred. Please try again.';
		});
};

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
const updateSubmitButton = function() {
	if (!element_usernameInput.value || !element_passwordInput.value || messageElement) {
		element_submitButton.className = 'unavailable';
	} else { // No Errors
		element_submitButton.className = 'ready';
	}
};

const updateForgotSubmitButton = function() {
	if (!element_forgotEmailInput.value.trim() || messageElement) { // Also consider if there's an active message
		element_forgotSubmitButton.className = 'unavailable';
	} else { // No errors and email input has value
		element_forgotSubmitButton.className = 'ready';
		element_forgotSubmitButton.disabled = false;
	}
};

// Generalize this function to create any message element
function createMessageElement(id, insertAfterId, initialClass) {
	const el = document.createElement('div');
	el.id = id;
	el.className = initialClass; // 'error' or 'success'
	document.getElementById(insertAfterId).insertAdjacentElement('afterend', el);
	return el;
}

function getQueryParam(name) {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(name);
}