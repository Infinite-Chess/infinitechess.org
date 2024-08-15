
const element_usernameInput = document.getElementById('username');
const element_passwordInput = document.getElementById('password');
const element_submitButton = document.getElementById('submit');
const element_forgot = document.getElementById('forgot');
let loginErrorElement = undefined;


//Event Listeners
element_usernameInput.addEventListener('input', handleInput); // When username field changes...
element_passwordInput.addEventListener('input', handleInput); // When username field changes...

//Checks for autofilled inputs on load
window.addEventListener('load', (event) => {
    if (element_usernameInput.value && element_passwordInput.value) {
        updateSubmitButton();
    }
});

element_submitButton.addEventListener('click', (event) => {
    event.preventDefault();

    if (element_usernameInput.value && element_passwordInput.value && !loginErrorElement) sendLogin(element_usernameInput.value, element_passwordInput.value);
});

function handleInput() {
    if (loginErrorElement) {
        loginErrorElement.remove();
        loginErrorElement = undefined;
    }

    updateSubmitButton();
    // Make forgot password message hidden
    element_forgot.className = 'forgothidden';
}

const sendLogin = (username, password) => {
    element_submitButton.disabled = true;

    let OK = false;
    let config = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            // const token = getCookieValue('token')

            // Check for a redirectTo query parameter, and if it exists, use it
            const redirectTo = getQueryParam('redirectTo');
            if (redirectTo) window.location.href = redirectTo;
            else window.location.href = `/member/${username.toLowerCase()}`;

        } else { // Unauthorized, create error with the message contained in response body
            if (!loginErrorElement) {
                createErrorElement('loginerror', 'passwordinputline');
                // Set variable because it now exists.
                loginErrorElement = document.getElementById("loginerror");
                // Make forgot password message visible
                element_forgot.className = 'forgotvisible';
            }
            updateSubmitButton();

            loginErrorElement.textContent = result['message'];
            element_submitButton.disabled = false;
        }
    });
}

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
const updateSubmitButton = function() {
    if (!element_usernameInput.value || !element_passwordInput.value || loginErrorElement) {
        element_submitButton.className = 'unavailable';
    } else { // No Errors
        element_submitButton.className = 'ready';
    }
}

function createErrorElement(id, insertAfter) {
    const errElement = document.createElement('div');
    errElement.className = 'error';
    errElement.id = id;
    // The element now looks like this:
    // <div class="error" id="usernameerror"></div>
    document.getElementById(insertAfter).insertAdjacentElement('afterend', errElement);
}

function getCookieValue(cookieName) {
    const cookieArray = document.cookie.split("; ");

    for (let i = 0; i < cookieArray.length; i++) {
        const cookiePair = cookieArray[i].split("=");

        if (cookiePair[0] === cookieName) {
            return cookiePair[1];
        }
    }
}

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}