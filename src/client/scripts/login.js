
const usernameInputElement = document.getElementById('username');
const passwordInputElement = document.getElementById('password');
const submitButton = document.getElementById('submit');
let loginErrorElement = undefined;
const forgotElement = document.getElementById('forgot');

usernameInputElement.addEventListener('input', (event) => { // When username field changes...
    loginErrorElement?.remove();
    loginErrorElement = undefined;
    updateSubmitButton();
    // Make forgot password message hidden
    forgotElement.className = 'forgothidden';
});

passwordInputElement.addEventListener('input', (event) => { // When username field changes...
    loginErrorElement?.remove();
    loginErrorElement = undefined;
    updateSubmitButton();
    // Make forgot password message hidden
    forgotElement.className = 'forgothidden';
});

submitButton.addEventListener('click', (event) => {
    event.preventDefault();

    if (usernameInputElement.value && passwordInputElement.value && !loginErrorElement) sendLogin(usernameInputElement.value, passwordInputElement.value);
});

const sendLogin = (username, password) => {
    submitButton.disabled = true;

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
                forgotElement.className = 'forgotvisible';
            }
            updateSubmitButton();
            loginErrorElement.textContent = result['message'];
            submitButton.disabled = false;
        }
    });
}

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
const updateSubmitButton = function() {
    if (!usernameInputElement.value || !passwordInputElement.value || loginErrorElement) {
        submitButton.className = 'unavailable';
    } else { // No Errors
        submitButton.className = 'ready';
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