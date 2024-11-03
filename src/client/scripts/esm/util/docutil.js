
/**
 * This script contains utility methods for the document/window objects, or the page.
 * 
 * ZERO dependancies.
 */

/**
 * Determines if the current page is running on a local environment (localhost or local IP).
 * @returns {boolean} *true* if the page is running locally, *false* otherwise.
 */
function isLocalEnvironment() {
	const hostname = window.location.hostname;
    
	// Check for common localhost hostnames and local IP ranges
	return (
		hostname === 'localhost' || // Localhost
        hostname === '127.0.0.1' || // Loopback IP address
        hostname.startsWith('192.168.') || // Private IPv4 address space
        hostname.startsWith('10.') || // Private IPv4 address space
        hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31 // Private IPv4 address space
	);
}

/**
 * Copies the provided text to the operating system's clipboard.
 * @param {string} text - The text to copy
 */
function copyToClipboard(text) {
	navigator.clipboard.writeText(text)
		.then(() => { console.log('Copied to clipboard'); })
		.catch((error) => { console.error('Failed to copy to clipboard', error); });
}

/**
 * Returns true if the current device has a mouse pointer.
 * @returns {boolean}
 */
function isMouseSupported() {
	// "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
	// See W3 documentation: https://www.w3.org/TR/mediaqueries-4/#mf-interaction
	return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Returns true if the current device supports touch events.
 * @returns {boolean}
 */
function isTouchSupported() {
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Gets the last segment of the current URL without query parameters.
 * "/member/jacob?lng=en-US" ==> "jacob"
 * @returns {string} - The last segment of the URL.
 */
function getLastSegmentOfURL() {
	const url = new URL(window.location.href);
	const pathname = url.pathname;
	const segments = pathname.split('/');
	return segments[segments.length - 1] || segments[segments.length - 2]; // Handle situation if trailing '/' is present
}

/**
 * Fetches data from a given endpoint after removing any query parameters from the URL.
 * 
 * @param {string} member - The member identifier to include in the URL.
 * @param {Object} config - The configuration object for the fetch request.
 * @returns {Promise<Response>} - The fetch response promise.
 */
function removeQueryParamsFromLink(link) {
	const url = new URL(link, window.location.origin);
	// Remove query parameters
	url.search = '';
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

function updateCookie(cookieName, value, days) {
	let expires = "";
	if (days) {
		const date = new Date();
		date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
		expires = "; expires=" + date.toUTCString();
	}
	document.cookie = cookieName + "=" + (value || "") + expires + "; path=/";
}

/**
 * Deletes a document cookie.
 * @param {string} cookieName - The name of the cookie you would like to delete.
 */
function deleteCookie(cookieName) {
	document.cookie = cookieName + '=; Max-Age=-99999999;';
}

export default {
	isLocalEnvironment,
	copyToClipboard,
	isMouseSupported,
	isTouchSupported,
	getLastSegmentOfURL,
	removeQueryParamsFromLink,
	getCookieValue,
	updateCookie,
	deleteCookie,
};