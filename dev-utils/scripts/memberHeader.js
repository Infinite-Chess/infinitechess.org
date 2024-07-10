
// This script will, if we're logged in, change the navigation bar to include the link to your profile.
// It also stores our token.
// And if we're not logged in, this will serve us a browser-id.

"use strict";

const validation = (function(){

    const TOKEN_EXPIRE_TIME_MILLIS = 1000 * 60 * 15; // Milliseconds   15m is the server expire time for access token.
    const cushionMillis = 10_000
    const browserIDExpireTimeMillis = 1000 * 60 * 60 * 24 * 7 - 1000*60*60; // 7 days is the expire time for browser id's, WITH SOME cushion! (-1hr)

    let requestOut = false;

    let token;
    let lastRefreshTime;
    let member;

    let areLoggedIn = true;

    const loginLink = document.getElementById('loginlink');
    const loginText = document.getElementById('logintext');
    const createaccountLink = document.getElementById('createaccountlink');
    const createaccountText = document.getElementById('createaccounttext');

    // If we're logged in, the log in button will change to their profile,
    // and create account will change to log out...

    function getMember() {
        return member;
    }

    function areWeLoggedIn() {
        return areLoggedIn;
    }

    /**
     * Returns access token, refreshing it first if needed.
     * @returns {string} Access token
     */
    async function getAccessToken() {

        while (requestOut) await main.sleep(100);

        const currTime = Date.now()
        const diff = currTime - lastRefreshTime

        // If it's expired, invalidate it.
        if (token && diff > (TOKEN_EXPIRE_TIME_MILLIS - cushionMillis)) token = undefined;

        // ...then try refreshing if we're logged in.
        if (!token && areLoggedIn) await refreshToken()
        else if (!areLoggedIn && diff > browserIDExpireTimeMillis) await refreshToken(); // Renews browser-id

        return token;
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
                token = getCookieValue('token');
                if (!token) {
                    console.error("Response from the server did not include a token!");
                } else {
                    console.log("Logged in");
                }

                member = result.member;
                changeNavigationLinks();
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
            requestOut = false;
        });
    }

    /**
     * Changes the navigation links if we're logged in.
     * 
     * Changes the Login and Create Account buttons to Profile and Log Out buttons.
     */
    function changeNavigationLinks() {

        loginLink.setAttribute('href', `/member/${member.toLowerCase()}`);
        loginText.textContent = 'Profile';

        createaccountLink.setAttribute('href', '/logout');
        createaccountText.textContent = 'Log Out';
    }

    /**
     * Searches the document for the specified cookie, and returns it if found.
     * @param {string} cookieName The name of the cookie you would like to retrieve.
     * @returns {string | undefined} The cookie, if it exists, otherwise, undefined.
     */
    function getCookieValue(cookieName) {
        const cookieArray = document.cookie.split("; ");
        
        for (let i = 0; i < cookieArray.length; i++) {
            const cookiePair = cookieArray[i].split("=");
            if (cookiePair[0] === cookieName) return cookiePair[1];
        }
    }

    /**
     * Deletes the current token from memory.
     */
    function deleteToken() {
        token = undefined;
    }

    refreshToken();

    return Object.freeze({
        getAccessToken,
        getMember,
        getCookieValue,
        deleteToken,
        areWeLoggedIn,
    })

})();