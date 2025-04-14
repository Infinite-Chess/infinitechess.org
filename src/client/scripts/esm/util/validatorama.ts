
// I called it validatorama because "validator" was already something
// in the Node environment or somewhere and so jsdoc wasn't auto suggesting the right one

/*
 * Fetches an access token and our username if we are logged in.
 *
 * If we are not logged in, the server will give us a browser-id
 * cookie to validate our identity in future requests.
 */

import docutil from "./docutil.js";


// Variables ----------------------------------------------------------------------------


const minTimeToRenewSession: number = 1000 * 60 * 60 * 24; // 1 day
// const minTimeToRenewSession: number = 1000 * 30; // 30 seconds

/** Expiration time for the access tokens. */
const TOKEN_EXPIRE_TIME_MILLIS: number = 1000 * 60 * 15; // 15 minutes
// const TOKEN_EXPIRE_TIME_MILLIS: number = 1000 * 30; // 30 seconds - CUSHION_MILLIS
/** Cushion time in milliseconds before considering the token expired. */
const CUSHION_MILLIS: number = 10_000;

let reqIsOut: boolean = false;
const resolvers: (() => void)[] = [];

let memberInfo: {
	signedIn: boolean;
	user_id?: number;
	username?: string;
	issued?: number;
	expires?: number;
} = {
	signedIn: false,
	user_id: undefined,
	username: undefined,
	issued: undefined,
	expires: undefined,
};

let tokenInfo: {
	/** Access token for authentication, if we are logged in AND have requested one! */
	accessToken?: string;
	/** Last refresh time of the access token, in milliseconds. */
	lastRefreshTime?: number;
} = {
	accessToken: undefined,
	lastRefreshTime: undefined,
};


// Functions ----------------------------------------------------------------------------


(function init() {
	initListeners();
  
	// Sets our memberInfo properties if we are logged in
	readMemberInfoCookie();
	// Most of the time we don't need an immediate access token
	// refreshToken();

	// Renew the session
	renewSession();
})();

function initListeners() {
	document.addEventListener('logout', resetMemberInfo);
	document.addEventListener('logout', onLogout);
	window.addEventListener('pageshow', readMemberInfoCookie); // Fired on initial page load AND when hitting the back button to return.
}

/**
 * Renews the session if it is older than the specified time to renew.
 */
function renewSession() {
	if (!memberInfo.signedIn) return;

	// Convert the ISO 8601 issued time to a timestamp
	const timeSinceSessionIssued = Date.now() - (memberInfo.issued || 0);
	
	// Check if the session is older than 1 day (minTimeToRenewSession)
	if (timeSinceSessionIssued < minTimeToRenewSession) return; // Still a freshly issued session!

	console.log("Session is older than 1 day, refreshing by requesting access token...");
	refreshToken(); // Refresh token if the session is too old
}

/**
 * Checks if the access token is expired or near-expiring.
 * If expired, it calls `refreshToken()` to get a new one.
 * 
 * If we're not signed in, the server will give/renew us a browser-id cookie for validating our identity.
 * @returns Resolves with the access token, or undefined if not logged in.
 */
async function getAccessToken(): Promise<string | undefined> {
	if (reqIsOut) await waitUntilInitialRequestBack();

	if (!memberInfo.signedIn) return;

	const timeSinceLastRefresh = Date.now() - (tokenInfo.lastRefreshTime || 0);

	// Check if token is expired or near expiring
	if (!tokenInfo.accessToken || timeSinceLastRefresh > (TOKEN_EXPIRE_TIME_MILLIS - CUSHION_MILLIS)) {
		await refreshToken();
	}

	return tokenInfo.accessToken;
}

/**
 * Inits the access token and our username if we are logged in.
 * 
 * Reads the `memberInfo` cookie to get the member details (username).
 * If not signed in, the server will renew the browser-id cookie.
 * 
 * @returns Resolves when the token refresh process is complete.
 */

async function refreshToken(): Promise<void> {
	reqIsOut = true;
	try {
		const response = await fetch('/api/get-access-token', {
			method: 'POST', // Ensure it's a POST request
			headers: {
				'Content-Type': 'application/json',
				"is-fetch-request": "true" // Custom header
			},
		});

		const result = await response.json();

		if (response.ok) { // Session token (refresh token cookie) is valid!
			const accessToken = docutil.getCookieValue('token'); // Read access token from cookie
			if (!accessToken) throw new Error('Token cookie not found!');
			tokenInfo = { accessToken, lastRefreshTime: Date.now() };

			// Delete the token cookie after reading it
			docutil.deleteCookie('token');
        
			// It's possible the server renewed our session. Let's read the memberInfo cookie again!
			readMemberInfoCookie();

			// Dispatch event to inform other parts of the app that we are logged in.
			// document.dispatchEvent(new CustomEvent('login'));

		} else { // 403 or 500 error   Likely not signed in! Our session token (refresh token cookie) was invalid or not present.
			console.log(`Server: ${result.message}`);
			deleteMemberInfoCookie();
			// Dispatch a custom logout event so our header code knows to update the navigation links
			document.dispatchEvent(new CustomEvent('logout'));
		}

	} catch (error) {
		console.error('Error occurred during token refresh:', error);
		readMemberInfoCookie();
	} finally {
		reqIsOut = false;
		// Resolve all pending promises
		while (resolvers.length > 0) {
			resolvers.shift()!(); // Get the first resolver and resolve it
		}
	}
}

/**
 * Read the memberInfo cookie, which will be present
 * if we have a refreshed token cookie, to grab our
 * username and user_id properties if we are signed in.
 */
function readMemberInfoCookie(): void {
	resetMemberInfo();

	// Read the member info from the cookie
	// Get the URL-encoded cookie value
	// JSON objects can't be stringified into cookies because cookies can't hold special characters
	const encodedMemberInfo = docutil.getCookieValue('memberInfo'); 
	if (!encodedMemberInfo) return; // No cookie, not signed in.
	// Decode the URL-encoded string
	const memberInfoStringified = decodeURIComponent(encodedMemberInfo);
	memberInfo = JSON.parse(memberInfoStringified); // { user_id, username, issued (timestamp), expires (timestamp) }
	memberInfo.signedIn = true;
}

/** Resets our member info variables as if we were logged out. */
function resetMemberInfo(): void {
	memberInfo = { signedIn: false };
}

function deleteMemberInfoCookie(): void {
	docutil.deleteCookie('memberInfo');
	resetMemberInfo();
}

function onLogout(): void {
	deleteMemberInfoCookie();
	tokenInfo = {};
}

/**
 * Waits until the initial request for an access token is completed.
 */
async function waitUntilInitialRequestBack(): Promise<void> {
	if (!reqIsOut) return; // If no request is out, resolve immediately
	// console.log("Waiting until initial request for an access token is completed... (Delete later)");

	// Create a promise that resolves when the request is completed
	return new Promise<void>(resolve => {
		resolvers.push(resolve); // Add this resolver to the list
	});
}

/**
 * Whether we are logged in based on whether the memberInfo cookie is present.
 */
function areWeLoggedIn(): boolean {
	return memberInfo.signedIn;
}

/**
 * Retrieves our username if we are logged in.
 * @returns The username, or undefined if not logged in.
 */
function getOurUsername(): string | undefined {
	return memberInfo.signedIn ? memberInfo.username : undefined;
}


// --------------------------------------------------------------------------------


export default {
	waitUntilInitialRequestBack,
	areWeLoggedIn,
	getOurUsername,
	getAccessToken,
};