// src/client/scripts/esm/util/validatorama.ts

/**
 * Exposes our login state and username/user_id, read from the `memberInfo` cookie. Auth itself
 * rides on the httpOnly refresh-token cookie (auto-sent same-site).
 */

import type { MemberInfoCookie } from '../../../../shared/types/memberinfo.js';

import docutil from './docutil.js';

// Types -----------------------------------------------------------------------

/** Our identity (the cookie payload) when signed in, else just the flag. */
type MemberInfoState = ({ signedIn: true } & MemberInfoCookie) | { signedIn: false };

// Variables -------------------------------------------------------------------

/** The timeout ID for the timer to check session expiry. */
let sessionExpiryTimer: number | undefined;

let memberInfo: MemberInfoState = { signedIn: false };

// Functions -------------------------------------------------------------------

(function init(): void {
	initListeners();

	// Sets our memberInfo properties if we are logged in
	readMemberInfoCookie();
})();

function initListeners(): void {
	window.addEventListener('pageshow', readMemberInfoCookie); // Fired on initial page load AND when hitting the back button to return.
}

/**
 * Read the memberInfo cookie, which is present if we have a session,
 * to grab our username and user_id properties if we are signed in.
 */
function readMemberInfoCookie(): void {
	resetMemberInfo();

	// Read the member info from the cookie
	// Get the URL-encoded cookie value
	// JSON objects can't be stringified into cookies because cookies can't hold special characters
	const encodedMemberInfo = docutil.getCookieValue('memberInfo');
	if (!encodedMemberInfo) return; // No cookie, not signed in.
	// Decode the URL-encoded string (cookies can't hold the special characters of raw JSON).
	const parsed: MemberInfoCookie = JSON.parse(decodeURIComponent(encodedMemberInfo));
	memberInfo = { signedIn: true, ...parsed };

	scheduleSessionLogout();
}

/**
 * Cleans up local auth state, then reloads the page to reflect the logged-out state.
 * Cleanup cancels the session-expiry timer so it can't fire again after the reset.
 */
function reloadAfterLogout(): void {
	docutil.deleteCookie('memberInfo');
	resetMemberInfo();
	window.location.reload();
}

/** Resets our member info variables as if we were logged out. */
function resetMemberInfo(): void {
	clearTimeout(sessionExpiryTimer); // Prevent ghost logout events after we've manually reset
	memberInfo = { signedIn: false };
}

/** Calculates time until session expiry and sets a timer to check session status. */
function scheduleSessionLogout(): void {
	clearTimeout(sessionExpiryTimer);
	if (!memberInfo.signedIn || !memberInfo.expires) return;

	const timeUntilExpiry = memberInfo.expires - Date.now();
	sessionExpiryTimer = window.setTimeout(() => checkSessionExpiry(), timeUntilExpiry);
}

/**
 * Callback for the session expiry timer.
 * Re-verifies cookie existence/expiry before deciding to reload or reschedule.
 */
function checkSessionExpiry(): void {
	const encodedMemberInfo = docutil.getCookieValue('memberInfo');

	// If cookie is gone, or we can't parse it, we are definitely logged out.
	if (!encodedMemberInfo) {
		// Only reload if we thought we were signed in
		if (memberInfo.signedIn) {
			console.log('Detected session expired. Reloading. - 1');
			reloadAfterLogout();
		}
		return;
	}

	const info = JSON.parse(decodeURIComponent(encodedMemberInfo));

	// Final check: Is it actually in the future? (has since been renewed)
	if (info.expires && info.expires > Date.now()) {
		// It was renewed! Update our local state and reschedule.
		readMemberInfoCookie();
	} else {
		// Still expired. Reload.
		console.log('Detected session expired. Reloading. - 2');
		reloadAfterLogout();
	}
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

/**
 * Retrieves our user_id (base 10) if we are logged in.
 * @returns The user_id, or undefined if not logged in.
 */
function getOurUserId(): number | undefined {
	return memberInfo.signedIn ? memberInfo.user_id : undefined;
}

// --------------------------------------------------------------------------------

export default {
	areWeLoggedIn,
	getOurUsername,
	getOurUserId,
	reloadAfterLogout,
};
