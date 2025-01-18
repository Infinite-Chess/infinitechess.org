
/**
 * This script contains utility methods for the document/window objects, or the page.
 * 
 * ZERO dependancies.
 */

/**
 * Determines if the current page is running on a local environment (localhost or local IP).
 * @returns *true* if the page is running locally, *false* otherwise.
 */
function isLocalEnvironment(): boolean {
	const hostname = window.location.hostname;
    
	// Check for common localhost hostnames and local IP ranges
	return (
		hostname === 'localhost' || // Localhost
        hostname === '127.0.0.1' || // Loopback IP address
        hostname.startsWith('192.168.') || // Private IPv4 address space
        hostname.startsWith('10.') || // Private IPv4 address space
        hostname.startsWith('172.') && parseInt(hostname.split('.')[1]!, 10) >= 16 && parseInt(hostname.split('.')[1]!, 10) <= 31 // Private IPv4 address space
	);
}

/**
 * Copies the provided text to the operating system's clipboard.
 * @param text - The text to copy
 */
function copyToClipboard(text: string) {
	navigator.clipboard.writeText(text)
		.then(() => { console.log('Copied to clipboard'); })
		.catch((error) => { console.error('Failed to copy to clipboard', error); });
}

/**
 * Returns true if the current device has a mouse pointer.
 */
function isMouseSupported(): boolean {
	// "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
	// See W3 documentation: https://www.w3.org/TR/mediaqueries-4/#mf-interaction
	return window.matchMedia("(pointer: fine)").matches;
}

/**
 * Returns true if the current device supports touch events.
 */
function isTouchSupported(): boolean {
	return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Gets the last segment of the current URL without query parameters.
 * "/member/jacob?lng=en-US" ==> "jacob"
 */
function getLastSegmentOfURL(): string {
	const url = new URL(window.location.href);
	const pathname = url.pathname;
	const segments = pathname.split('/').filter(Boolean); // Remove empty segments caused by leading/trailing slashes
	return segments[segments.length - 1] ?? ''; // Fallback to an empty string if no segment exists
}

/**
 * Extracts the pathname from a given href.
 * (e.g. "https://www.infinitechess.org/news?lng=en-US" ==> "/news")
 * @param href - The href to extract the pathname from. Can be a relative or absolute URL.
 * @returns The pathname of the href (e.g., '/news').
 */
function getPathnameFromHref(href: string) {
	const url = new URL(href, window.location.origin);
	return url.pathname;
}

/**
 * Searches the document for the specified cookie, and returns it if found.
 * @param cookieName The name of the cookie you would like to retrieve.
 * @returns The cookie, if it exists, otherwise, undefined.
 */
function getCookieValue(cookieName: string): string | undefined {
	const cookieArray = document.cookie.split("; ");
	
	for (let i = 0; i < cookieArray.length; i++) {
		const cookiePair = cookieArray[i]!.split("=");
		if (cookiePair[0] === cookieName) return cookiePair[1];
	}

	return; // Typescript is angry without this
}

/**
 * Sets a cookie in the document
 * @param cookieName - The name of the cookie
 * @param value - The value of the cookie
 * @param days - How many days until the cookie should expire.
 */
function updateCookie(cookieName: string, value: string, days: number) {
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
 * @param cookieName - The name of the cookie you would like to delete.
 */
function deleteCookie(cookieName: string) {
	document.cookie = cookieName + '=; Max-Age=-99999999;';
}

export default {
	isLocalEnvironment,
	copyToClipboard,
	isMouseSupported,
	isTouchSupported,
	getLastSegmentOfURL,
	getPathnameFromHref,
	getCookieValue,
	updateCookie,
	deleteCookie,
};