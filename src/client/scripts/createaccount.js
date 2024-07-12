
const usernameInputElement = document.getElementById('username');
const emailInputElement = document.getElementById('email');
const passwordInputElement = document.getElementById('password');
const submitButton = document.getElementById('submit');

// This will be an object with 3 arrays: memberList, reservedUsernames, profainWords
let data;
fetch('/createaccount/data')
    .then((response) => response.json())
    .then((result) => {data = result});

let usernameHasError = false;
usernameInputElement.addEventListener('input', (event) => { // When username field changes...
    
    // Test if the value of the username input field won't be accepted.

    // 3-25 characters in length.
    // Accepted characters: A-Z 0-9
    // Doesn't contain existing/reserved usernames.
    // Doesn't contain profain words.

    let usernameError = document.getElementById("usernameerror"); // Does an error already exist?

    const lengthError = usernameInputElement.value.length < 3;
    const formatError = !onlyLettersAndNumbers(usernameInputElement.value);
    // If data is still uninitiated (late fetch call), just assume there's no error.
    const usernameReservedError = 
        data ? !lengthError && data.reservedUsernames.indexOf(usernameInputElement.value.toLowerCase()) !== -1
        : false;
    const profainError = 
        data ? !lengthError && checkProfanity(usernameInputElement.value)
        : false;

    // If ANY error, make sure errorElement is created
    if (lengthError || formatError || usernameReservedError || profainError) {
        if (!usernameError) { // Create empty errorElement
            usernameHasError = true;
            createErrorElement('usernameerror', "usernameinputline");
            // Change input box to red outline
            usernameInputElement.style.outline = 'solid 1px red';
            // Reset variable because it now exists.
            usernameError = document.getElementById("usernameerror");
        }
    } else if (usernameError) { // No errors, delete that error element if it exists
        usernameHasError = false;
        usernameError.remove();
        usernameInputElement.removeAttribute('style');
    }
    
    if (lengthError && formatError) {
        usernameError.textContent = 'Username must be atleast 3 characters long, and only contain letters A-Z and numbers 0-9';
    } else if (lengthError) { // Change error message
        usernameError.textContent = 'Username must be atleast 3 characters long';
    } else if (formatError) {
        usernameError.textContent = 'Username must only contain letters A-Z and numbers 0-9';
    } else if (usernameReservedError) {
        usernameError.textContent = 'That username is reserved'
    } else if (profainError) {
        usernameError.textContent = 'That username contains a word that is not allowed'
    }

    updateSubmitButton();
})
usernameInputElement.addEventListener('focusout', (event) => { // Check username availability...
    if (usernameInputElement.value.length === 0 || usernameHasError) return;

    fetch(`/createaccount/username/${usernameInputElement.value}`)
    .then((response) => response.json())
    .then((result) => {
        // We've got the result back from the server,
        // Is this username available to use?
        if (result[0] === true) return; // Not in use

        // ERROR! In use!
        usernameHasError = true;
        createErrorElement('usernameerror', "usernameinputline");
        // Change input box to red outline
        usernameInputElement.style.outline = 'solid 1px red';
        // Reset variable because it now exists.
        usernameError = document.getElementById("usernameerror");

        usernameError.textContent = 'That username is taken';
        updateSubmitButton();
    });
})

let emailHasError = false;
emailInputElement.addEventListener('input', (event) => { // When email field changes...
    
    // Test if the email is a valid email format

    let emailError = document.getElementById("emailerror"); // Does an error already exist?

    const error = !validEmail(emailInputElement.value);

    // If ANY error, make sure errorElement is created
    if (error) {
        if (!emailError) { // Create empty errorElement
            emailHasError = true;
            createErrorElement('emailerror', 'emailinputline')
            // Change input box to red outline
            emailInputElement.style.outline = 'solid 1px red';
            // Reset variable because it now exists.
            emailError = document.getElementById("emailerror");
        }
    } else if (emailError) { // No errors, delete that error element if it exists
        emailHasError = false;
        emailError.remove();
        emailInputElement.removeAttribute('style');
    }
    
    if (error) {
        emailError.textContent = 'This is not a valid email';
    }

    updateSubmitButton();
})
emailInputElement.addEventListener('focusout', (event) => { // Check email availability...
    // If it's blank, all the server would send back is the createaccount.html again..
    if (emailInputElement.value.length > 1 && !emailHasError) { 
        fetch(`/createaccount/email/${emailInputElement.value}`)
        .then((response) => response.json())
        .then((result) => {
            // We've got the result back from the server,
            // Is this email available to use?
            if (result[0] === false) { // Email in use
                emailHasError = true;
                createErrorElement('emailerror', 'emailinputline')
                // Change input box to red outline
                emailInputElement.style.outline = 'solid 1px red';
                // Reset variable because it now exists.
                const emailError = document.getElementById("emailerror");

                emailError.textContent = 'This email is already in use';
                updateSubmitButton();
            }
        });
    }
})

let passwordHasError = false;
passwordInputElement.addEventListener('input', (event) => { // When password field changes...
    
    let passwordError = document.getElementById("passworderror"); // Does an error already exist?

    const lengthError = passwordInputElement.value.length < 6 || passwordInputElement.value.length > 256;
    const formatError = !validPassword(passwordInputElement.value);
    const containsPasswordError = passwordInputElement.value.toLowerCase() === 'password';

    // If ANY error, make sure errorElement is created
    if (lengthError || formatError || containsPasswordError) {
        if (!passwordError) { // Create empty errorElement
            passwordHasError = true;
            createErrorElement('passworderror', 'passwordinputline');
            // Change input box to red outline
            passwordInputElement.style.outline = 'solid 1px red';
            // Reset variable because it now exists.
            passwordError = document.getElementById("passworderror");
        }
    } else if (passwordError) { // No errors, delete that error element if it exists
        passwordHasError = false;
        passwordError.remove();
        passwordInputElement.removeAttribute('style');
    }

    if (formatError) {
        passwordError.textContent = 'Password is in an incorrect format';
    } else if (lengthError) {
        passwordError.textContent = 'Password must be 6-256 characters long';
    } else if (containsPasswordError) {
        passwordError.textContent = "Password must not be 'password'";
    }

    updateSubmitButton();
})

submitButton.addEventListener('click', (event) => {
    event.preventDefault();

    if (!usernameHasError && !emailHasError && !passwordHasError
        && usernameInputElement.value
        && emailInputElement.value
        && passwordInputElement.value) sendForm(usernameInputElement.value, emailInputElement.value, passwordInputElement.value);
})

sendForm = function (username, email, password) {
    let OK = false;
    let config = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            // token = getCookieValue('token') // Cookie expires in 60s
            window.location.href = `/member/${username.toLowerCase()}`;
        } else { // Conflict, unable to make account. 409 CONFLICT
            window.location.href = '/409';
        }
    });
}

createErrorElement = function (id, insertAfter) {
    const errElement = document.createElement('div');
    errElement.className = 'error';
    errElement.id = id;
    // The element now looks like this:
    // <div class="error" id="usernameerror"></div>
    document.getElementById(insertAfter).insertAdjacentElement('afterend', errElement);
}

// Greys-out submit button if there's any errors.
// The click-prevention is taken care of in the submit event listener.
const updateSubmitButton = function() {
    if (usernameHasError || emailHasError || passwordHasError
        || !usernameInputElement.value
        || !emailInputElement.value
        || !passwordInputElement.value) {
        submitButton.className = 'unavailable';
    } else { // No Errors
        submitButton.className = 'ready';
    }
}

onlyLettersAndNumbers = function(string) {
    if (!string) return true;
    return /^[a-zA-Z0-9]+$/.test(string);
}

// Returns true if bad word is found
checkProfanity = function(string) {
    for (let i = 0; i < data.profainWords.length; i++) {
        profanity = data.profainWords[i];
        if (string.toLowerCase().includes(profanity)) return true;
    }
    return false;
}

validEmail = function(string) {
    // Credit for the regex: https://stackoverflow.com/a/201378
    const regex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
    if (regex.test(string) === true) return true;
    return false;
}

validPassword = function(string) {
    const regex = /^[a-zA-Z0-9!@#$%^&*\?]+$/;

    if (regex.test(string) === true) return true;
    return false;
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