
// I called it validatorama because "validator" was already something
// in the Node environment or somewhere and so jsdoc wasn't auto suggesting the right one

/*
 * Fetches an access token and our usernameif we are logged in.

 * If we are not logged in the server will give us a browser-id
 * cookie to validate our identity in future requests.
 */

import docutil from "./docutil.js";

/** Our username, if we are logged in. @type {string | undefined} */
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

document.addEventListener('logout', event => { // Custom-event listener. Often fired when a web socket connection closes due to us logging out.
	username = undefined;
	accessToken = undefined;
	lastRefreshTime = undefined;
});

/**
 * Checks if the access token is expired or near-expiring.
 * If expired, it calls `refreshToken()` to get a new one.
 * 
 * If we're not signed in, the server will give/renew us a browser-id cookie for validating our identity.
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
 * Reads the `memberInfo` cookie to get the member details (username).
 * If not signed in, the server will renew the browser-id cookie.
 * 
 * @returns {Promise<void>} Resolves when the token refresh process is complete.
 */
async function refreshToken() {
	reqIsOut = true;
	let OK = false;

	try {
		const response = await fetch('/api/get-access-token', {
			method: 'POST', // Ensure it's a POST request
			headers: {
				'Content-Type': 'application/json', // Add the appropriate headers if needed
			},
		});
		OK = response.ok;

		const result = await response.json();

		if (OK) { // Refresh token (from cookie) accepted!
			accessToken = docutil.getCookieValue('token'); // Read access token from cookie
			if (!accessToken) console.error("Token not found in the cookie!");
			lastRefreshTime = Date.now(); // Update the last refresh time
		} else { // 403 of 500 error
			console.log(`Server: ${result.message}`);
			docutil.deleteCookie('memberInfo');
		}

		// Delete the token cookie after reading it
		docutil.deleteCookie('token');
		refreshOurUsername();

	} catch (error) {
		console.error('Error occurred during token refresh:', error);
	} finally {
		reqIsOut = false;
		// Dispatch event to inform other parts of the app that validation is complete
		document.dispatchEvent(new CustomEvent('validated'));
	}
}

/**
 * Read the memberInfo cookie, which will be present
 * if we have a refreshed token cookie, to grab our
 * username and user_id properties if we are signed in.
 */
function refreshOurUsername() {
	// Read the member info from the cookie
	// Get the URL-encoded cookie value
	// JSON objects can't be string into cookies because cookies can't hold special characters
	const encodedMemberInfo = docutil.getCookieValue('memberInfo'); 
	if (!encodedMemberInfo) {
		username = undefined;
		return; // No cookie, not signed in.
	}
	// Decode the URL-encoded string
	const memberInfoStringified = decodeURIComponent(encodedMemberInfo);
	const memberInfo = JSON.parse(memberInfoStringified); // { user_id, username }

	username = memberInfo.username;
}

/**
 * Waits until the initial request for an access token is completed.
 */
async function waitUntilInitialRequestBack() {
	while (reqIsOut) {
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

/**
 * Checks if we are logged in based on whether the username is defined.
 * @returns {boolean} True if logged in, false otherwise.
 */
function areWeLoggedIn() {
	return username !== undefined;
}

/**
 * Retrieves our username if we are logged in.
 * @returns {string | undefined} The username, or undefined if not logged in.
 */
function getOurUsername() {
	return username;
}

refreshOurUsername();
refreshToken();

// Export these methods to be used by other scripts
export default {
	refreshToken,
	waitUntilInitialRequestBack,
	areWeLoggedIn,
	getOurUsername,
	getAccessToken,
};
