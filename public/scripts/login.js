
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

const sendLogin = async (username, password) => {
    submitButton.disabled = true;
    const ip = await getClientIp();

    let OK = false;
    let config = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', // Allows cookie to be set from this request
        body: JSON.stringify({username, password, ip})
    };

    let response = await fetch('/auth', config);
    if (response.ok) OK = true;
    const result = await response.json();

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

createErrorElement = function (id, insertAfter) {
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

/** 
 * Get's client ip address.
 * Used in api call for countering login spam from one ip address.
 * @returns {string} Ip address or "false" when error
*/
async function getClientIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error fetching IP address:', error);
        return null;
    }
}