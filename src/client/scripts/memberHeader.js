
// This script will, if we're logged in, change the navigation bar to include the link to your profile.
// It also stores our token.
// And if we're not logged in, this will serve us a browser-id.

"use strict";

// eslint-disable-next-line no-unused-vars
const memberHeader = (function() {

	const TOKEN_EXPIRE_TIME_MILLIS = 1000 * 60 * 15; // Milliseconds   15m is the server expire time for access token.
	const cushionMillis = 10_000;
	const browserIDExpireTimeMillis = 1000 * 60 * 60 * 24 * 7 - 1000 * 60 * 60; // 7 days is the expire time for browser id's, WITH SOME cushion! (-1hr)

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
		return lastRefreshTime !== undefined;
	}

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

		while (requestOut) await sleep(100);

		const currTime = Date.now();
		const diff = currTime - lastRefreshTime;

		// If it's expired, invalidate it.
		if (token && diff > (TOKEN_EXPIRE_TIME_MILLIS - cushionMillis)) token = undefined;

		// ...then try refreshing if we're logged in.
		if (!token && areLoggedIn) await refreshToken();
		else if (!areLoggedIn && diff > browserIDExpireTimeMillis) await refreshToken(); // Renews browser-id

		return token;
	}

	/**
     * This function will not return until our initial request for an access token,
     * to see if we're logged in, is back.
     */
	async function waitUntilInitialRequestBack() {
		while (lastRefreshTime === undefined) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}


	/**
     * Inits our token, and, if we're logged in, inits member, and changes navigation links if we're logged in.
     * 
     * If we're not signed in, the server will give/renew us a browser-id cookie for validating our identity.
     */
	function refreshToken() {
		requestOut = true;
		lastRefreshTime = undefined; // Set as undefined, because waitUntilInitialRequestBack() relies on it being undefined
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
				} else { // Unauthorized, don't change any navigation links. Should have given us a browser-id!
					console.log(`Server: ${result.message}`);
					areLoggedIn = false;
				}
				// Delete the token cookie after reading it, so it doesn't bleed
				// into future page refreshes, even after we have logged out
				deleteCookie('token');
				updateNavigationLinks();
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
     * Changes the navigation links, depending on if we're logged in, to
     * go to our Profile or the Log Out route, or the Log In / Create Account pages.
     */
	function updateNavigationLinks() {
		if (areLoggedIn) {
			loginLink.href = addLngQueryParamToLink(`/member/${member.toLowerCase()}`);
			loginText.textContent = translations["js-profile"];
			createaccountLink.href = addLngQueryParamToLink('/logout');
			createaccountText.textContent = translations["js-logout"];
		} else { // Not logged in
			loginLink.href = addLngQueryParamToLink('/login');
			loginText.textContent = translations["js-login"];
			createaccountLink.href = addLngQueryParamToLink('/createaccount');
			createaccountText.textContent = translations["js-createaccount"];
		}
	}

	/**
     * Adds the "lng" query parameter to all navigation links.
     */
	function addLngToNavLinks() {
		const lng = getCookieValue('i18next');
		if (!lng) return;
    
		const navLinks = document.querySelectorAll('nav a');
		navLinks.forEach(link => {
			link.href = addLngQueryParamToLink(link);
		});

		/** Adds the "lng" query parameter to the ToS link at the bottom, if it exists (it doesn't on the play page) */
		toslink: {
			const element_toslink = document.getElementById("toslink");
			if (!element_toslink) break toslink;
			element_toslink.href = addLngQueryParamToLink(element_toslink);
		}
	}

	/**
     * Modifies the given URL to include the "lng" query parameter based on the i18next cookie.
     * @param {string} href - The original URL.
     * @returns {string} The modified URL with the "lng" query parameter.
     */
	function addLngQueryParamToLink(href) {
		// Get the value of the i18next cookie
		const lng = getCookieValue('i18next');
		if (!lng) return href;
    
		// Create a URL object from the given href
		const url = new URL(href, window.location.origin);
    
		// Add or update the "lng" query parameter
		url.searchParams.set('lng', lng);
    
		// Return the modified URL as a string
		return url.toString();
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
     * Deletes a document cookie.
     * @param {string} cookieName - The name of the cookie you would like to delete.
     */
	function deleteCookie(cookieName) {
		document.cookie = cookieName + '=; Max-Age=-99999999;';  
	}

	/**
     * This is called when a web socket connection closes due
     * to us logging out, this updates the header bar hyperlinks.
     */
	function onLogOut() {
		areLoggedIn = false;
		deleteToken();
		updateNavigationLinks();
	}

	/**
     * Deletes the current token from memory.
     */
	function deleteToken() {
		token = undefined;
	}

	/**
     * Pauses the current function execution for the given amount of time, allowing
     * other functions in the call stack to execute before it resumes.
     * 
     * This function returns a promise that resolves after the specified number of milliseconds.
     * @param {number} ms - The number of milliseconds to sleep before continuing execution.
     * @returns {Promise<void>} A promise that resolves after the specified delay.
     */
	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	refreshToken();

	// Ensure the lng query parameter is added to all nav links
	addLngToNavLinks();

	return Object.freeze({
		getAccessToken,
		refreshToken,
		getMember,
		getCookieValue,
		deleteCookie,
		onLogOut,
		deleteToken,
		areWeLoggedIn,
		waitUntilInitialRequestBack
	});

})();

favicon: { // This block auto detects device theme and adjusts the browser icon accordingly

	const element_favicon = document.getElementById('favicon');

	/**
     * Switches the browser icon to match the given theme.
     * @param {string} theme "dark"/"light"
     */
	function switchFavicon(theme) {
		if (theme === 'dark') element_favicon.href = '/img/favicon-dark.png';
		else element_favicon.href = '/img/favicon-light.png';
	}
    
	if (!window.matchMedia) break favicon; // Don't create a theme-change event listener if matchMedia isn't supported.

	// Initial theme detection
	const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
	switchFavicon(prefersDarkScheme ? 'dark' : 'light');
    
	// Listen for theme changes
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
		const newTheme = event.matches ? 'dark' : 'light';
		console.log(`Toggled ${newTheme} icon`);
		switchFavicon(newTheme);
	});
}

{ // This block auto-removes the "lng" query parameter from the url, visually, without refreshing
	function removeLngQueryParam() {
		// Create a URL object from the current window location
		const url = new URL(window.location);
  
		// Remove the "lng" query parameter
		url.searchParams.delete('lng');
  
		// Update the browser's URL without refreshing the page
		window.history.replaceState({}, '', url);
	}
 
	// Remove the "lng" param from the url bar when the DOM content is fully loaded
	document.addEventListener('DOMContentLoaded', removeLngQueryParam);
}