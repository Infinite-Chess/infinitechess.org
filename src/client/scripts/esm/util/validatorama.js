
// I called it validatorama because "validator" was already something
// in the Node environment or somewhere and so jsdoc wasn't auto suggesting the right one

/*
 * Fetches an access token and our usernameif we are logged in.

 * If we are not logged in the server will give us a browser-id
 * cookie to validate our identity in future requests.
 */

import docutil from "./docutil.js";

/** Our username, if we are logged in. @type {string} */
let username;
let reqIsOut = false;

document.addEventListener('logout', event => { // Custom-event listener. Often fired when a web socket connection closes due to us logging out.
	username = undefined;
});


// If we're logged in, the log in button will change to their profile,
// and create account will change to log out...

function areWeLoggedIn() {
	return username !== undefined;
}

function getOurUsername() {
	return username;
}

/**
 * Inits our token, and, if we're logged in, inits member, and changes navigation links if we're logged in.
 * 
 * If we're not signed in, the server will give/renew us a browser-id cookie for validating our identity.
 * 
 * @returns {Promise<void>} Resolves when the token refresh process is complete.
 */
async function refreshToken() {
	reqIsOut = true;
	let OK = false;
	
	try {
		const response = await fetch('/refresh');
		OK = response.ok;

		const result = await response.json();

		if (OK) { // Refresh token (from cookie) accepted!
			// token = docutil.getCookieValue('token'); // The access token is provided in this cookie, with a 10-second expiry time
			username = result.member;
		} else { // Unauthorized, don't change any navigation links. Should have given us a browser-id!
			console.log(`Server: ${result.message}`);
		}

		// Delete the token cookie after reading it, so it doesn't bleed
		// into future page refreshes, even after we have logged out
		docutil.deleteCookie('token');
	} catch (error) {
		// Handle the error
		console.error('Error occurred during refreshing of token:', error);
		// Optionally set areLoggedIn to false or perform other error handling logic here
	} finally {
		reqIsOut = false;
		// Grey the background of the profile button if we are viewing our profile AND are logged in
		document.dispatchEvent(new CustomEvent('validated')); // Our header script listens for this so it knows to change the links of the header.
	}
}


/**
 * This function will not return until our initial request for an access token,
 * to see if we're logged in, is back.
 */
async function waitUntilInitialRequestBack() {
	while (reqIsOut) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

refreshToken();

// Export these methods to be used by other scripts
export default {
	refreshToken,
	waitUntilInitialRequestBack,
	areWeLoggedIn,
	getOurUsername,
};