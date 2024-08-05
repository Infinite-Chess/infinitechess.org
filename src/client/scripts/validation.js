// This script is used on the /play page.
// It stores our access token.
// And if we're not logged in, this will retrieve us a browser-id.

"use strict";

const validation = (function(){

    let requestOut = false;

    let token;
    let lastRefreshTime;
    let member;

    let areLoggedIn = true;

    const loginLink = document.getElementById('loginlink');
    const loginText = document.getElementById('logintext');
    const createaccountLink = document.getElementById('createaccountlink');
    const createaccountText = document.getElementById('createaccounttext');

    /**
     * Returns true if we've received back our first token request.
     * After that, we know we either are logged in, or have a browser-id cookie.
     * @returns {boolean}
     */
    function haveWeSentInitialRequest() {
        return lastRefreshTime != null;
    }

    async function waitUntilInitialRequestBack() {
        while (lastRefreshTime == null) {
            await main.sleep(100);
        }
    }

    /**
     * Inits our token, and, if we're logged in, inits member, and changes navigation links if we're logged in.
     *
     * If we're not signed in, the server will give/renew us a browser-id cookie for validation.
     */
    function refreshToken() {
        requestOut = true;
        let OK = false;

        fetch('/refresh')
        .then(response => {
            if (response.ok) {
                OK = true;
            }
            return response.json();
        })
        .then(result => {
            if (OK) { // Refresh token (from cookie) accepted!
                token = memberHeader.getCookieValue('token');
                if (!token) {
                    console.error("Response from the server did not include a token!");
                } else {
                    console.log("Logged in");
                }

                member = result.member;
                updateNavigationLinks();
            } else { // Unauthorized, don't change any navigation links. Should have given us a browser-id!
                console.log(`Server: ${result['message']}`);
                areLoggedIn = false;
            }

            lastRefreshTime = Date.now();
            requestOut = false;
        })
        .catch(error => {
            // Handle the error
            console.error('Error occurred during refreshing of token:', error);
            // You can also set areLoggedIn to false or perform other error handling logic here
            lastRefreshTime = Date.now();
            requestOut = false;
        });
    }

    /**
     * Changes the navigation links if we're logged in. Changes the Login
     * and Create Account buttons to and from Profile and Log Out buttons.
     */
    function updateNavigationLinks() {
        if (areLoggedIn) {
            loginLink.setAttribute('href', `/member/${member.toLowerCase()}`);
            loginText.textContent = translations["js-profile"];

            createaccountLink.setAttribute('href', '/logout');
            createaccountText.textContent = translations["js-logout"];
        } else {
            loginLink.setAttribute('href', `/login`);
            loginText.textContent = translations["js-login"];

            createaccountLink.setAttribute('href', '/createaccount');
            createaccountText.textContent = translations["js-createaccount"];
        }
    }

    /**
     * Returns all document cookies accessible by javascript.
     * This excludes cookies like our refresh token and browser-id.
     * @returns {string} The cookies
     */
    function getAllCookies() {
        return document.cookie;
    }

    refreshToken();

    return Object.freeze({
        getAllCookies,
        waitUntilInitialRequestBack
    })

})();