// src/client/scripts/esm/util/docutil.ts

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
		(hostname.startsWith('172.') &&
			parseInt(hostname.split('.')[1]!, 10) >= 16 &&
			parseInt(hostname.split('.')[1]!, 10) <= 31) // Private IPv4 address space
	);
}

/**
 * Copies the provided text to the operating system's clipboard.
 * @returns Whether it succeeded. The reason for a failure is logged, never returned.
 */
async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (error) {
		console.error('Failed to copy to clipboard', error);
		return false;
	}
}

/**
 * Reads the operating system's clipboard.
 * @returns Its text, or undefined if access was denied. The reason for a failure is
 * logged, never returned.
 */
async function readFromClipboard(): Promise<string | undefined> {
	try {
		return await navigator.clipboard.readText();
	} catch (error) {
		console.error('Failed to read from clipboard', error);
		return undefined;
	}
}

/**
 * Whether the user is typing in a text field (text input, textarea, or contenteditable),
 * meaning keyboard and clipboard events belong to it rather than to the page.
 */
function isTypingInTextField(): boolean {
	const active = document.activeElement;
	return (
		// A focused checkbox isn't typing — bare keys (Space, arrows…) should still control the board.
		(active instanceof HTMLInputElement && active.type !== 'checkbox') ||
		active instanceof HTMLTextAreaElement ||
		(active instanceof HTMLElement && active.isContentEditable)
	);
}

/**
 * Returns true if the current device has a mouse pointer.
 */
function isMouseSupported(): boolean {
	// "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
	// See W3 documentation: https://www.w3.org/TR/mediaqueries-4/#mf-interaction
	// USING "any-pointer" CAUSES false positives on mobile devices!
	return window.matchMedia('(pointer: fine)').matches;
}

/**
 * Returns true if the current device supports touch events.
 */
function isTouchSupported(): boolean {
	// "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
	return (
		'ontouchstart' in window ||
		navigator.maxTouchPoints > 0 ||
		window.matchMedia('(pointer: coarse)').matches
	);
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
function getPathnameFromHref(href: string): string {
	const url = new URL(href, window.location.origin);
	return url.pathname;
}

/**
 * Reads a query‐param from the current URL.
 * @param name - The name of the parameter to read.
 * @returns The parameter's value, or null if not present.
 */
function getQueryParam(name: string): string | null {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(name);
}

/**
 * Searches the document for the specified cookie, and returns it if found.
 * @param cookieName The name of the cookie you would like to retrieve.
 * @returns The cookie, if it exists, otherwise, undefined.
 */
function getCookieValue(cookieName: string): string | undefined {
	const cookieArray = document.cookie.split('; ');

	for (let i = 0; i < cookieArray.length; i++) {
		const cookiePair = cookieArray[i]!.split('=');
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
function updateCookie(cookieName: string, value: string, days: number): void {
	let expires = '';
	if (days) {
		const date = new Date();
		date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
		expires = '; expires=' + date.toUTCString();
	}
	document.cookie = cookieName + '=' + (value || '') + expires + '; path=/';
}

/**
 * Deletes a document cookie.
 * @param cookieName - The name of the cookie you would like to delete.
 */
function deleteCookie(cookieName: string): void {
	document.cookie = cookieName + '=; Max-Age=-99999999;';
}

/**
 * Parse an SVG string into a live SVGElement.
 * @param svgText — a string containing valid `<svg>…</svg>` markup
 * @returns the newly created SVG element
 */
function createSvgElementFromString(svgText: string): SVGElement {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgText, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	if (!svg) throw new Error('Failed to parse SVG string.');
	return svg;
}

export default {
	isLocalEnvironment,
	copyToClipboard,
	readFromClipboard,
	isTypingInTextField,
	isMouseSupported,
	isTouchSupported,
	getLastSegmentOfURL,
	getQueryParam,
	getPathnameFromHref,
	getCookieValue,
	updateCookie,
	deleteCookie,
	createSvgElementFromString,
};
