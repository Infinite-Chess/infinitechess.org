
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

/** Access token for authentication, if we are logged in. @type {string | undefined} */
let accessToken;

/** Last refresh time of the access token, in milliseconds. @type {number | undefined} */
let lastRefreshTime;

/** Expiration time for the token in milliseconds. @type {number} */
const TOKEN_EXPIRE_TIME_MILLIS = 1000 * 60 * 15; // 15 minutes

/** Cushion time in milliseconds before considering the token expired. @type {number} */
const CUSHION_MILLIS = 10_000;

let reqIsOut = false;

document.addEventListener('logout', event => {
	username = undefined;
	accessToken = undefined;
	lastRefreshTime = undefined;
});

function areWeLoggedIn() {
	return username !== undefined;
}

function getOurUsername() {
	return username;
}

/**
 * Checks if the access token is expired or near-expiring.
 * If expired, it calls `refreshToken()` to get a new one.
 * 
 * @returns {Promise<string | undefined>} Resolves with the access token, or undefined if not logged in.
 */
async function getAccessToken() {
	if (reqIsOut) await waitUntilInitialRequestBack();

	if (!areWeLoggedIn()) return;

	const currentTime = Date.now();
	const timeSinceLastRefresh = currentTime - (lastRefreshTime || 0);

	// Check if token is expired or near expiring
	if (!accessToken || timeSinceLastRefresh > (TOKEN_EXPIRE_TIME_MILLIS - CUSHION_MILLIS)) {
		await refreshToken();
	}

	return accessToken;
}

/**
 * Inits the access token and our username if we are logged in.
 * 
 * If we are not signed in, the server will give/renew us a browser-id cookie for validating our identity.
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
			accessToken = docutil.getCookieValue('token'); // Access token provided in the cookie, 10-second expiry time, GRAB IT NOW!!
			username = result.member;
			lastRefreshTime = Date.now(); // Update the last refresh time
		} else {
			console.log(`Server: ${result.message}`);
		}

		// Delete the token cookie after reading it to prevent it from bleeding into future page refreshes
		docutil.deleteCookie('token');
	} catch (error) {
		console.error('Error occurred during refreshing of token:', error);
	} finally {
		reqIsOut = false;
		// Our header script listens for this so it knows to change the links of the header.
		document.dispatchEvent(new CustomEvent('validated')); // Inform header script to update links
	}
}

/**
 * Waits until the initial request for an access token is completed.
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
	getAccessToken,
};
