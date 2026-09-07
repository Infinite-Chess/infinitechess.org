// src/client/scripts/esm/util/validatorama.ts

/**
 * Exposes our login state and username/user_id, read from the `memberInfo` cookie. Auth itself
 * rides on the httpOnly refresh-token cookie (auto-sent same-site). A login or logout in one
 * tab reloads the browser's others.
 */

import type { MemberInfoCookie } from '../../../../shared/types/memberinfo.js';

import docutil from './docutil.js';
import navigate from './navigate.js';

// Types -----------------------------------------------------------------------

/** Our identity (the cookie payload) when signed in, else just the flag. */
type MemberInfoState = ({ signedIn: true } & MemberInfoCookie) | { signedIn: false };

// State -----------------------------------------------------------------------

/** Pings the browser's other tabs, prompting them to re-check who they're rendered for. */
const identityChannel = new BroadcastChannel('identity');

/** The timeout ID for the timer to check session expiry. */
let sessionExpiryTimer: number | undefined;

let memberInfo: MemberInfoState = { signedIn: false };

// Initialization --------------------------------------------------------------

(function init(): void {
	initListeners();

	// Sets our memberInfo properties if we are logged in
	readMemberInfoCookie();

	// Empty payload on purpose: every tab answers by re-reading the cookie they all share.
	identityChannel.postMessage(null);
})();

function initListeners(): void {
	window.addEventListener('pageshow', resyncMemberInfo); // Fired on initial page load AND when hitting the back button to return.
	identityChannel.addEventListener('message', resyncMemberInfo);
}

// Identity --------------------------------------------------------------------

/**
 * Re-reads the cookie, reloading if our identity changed since this page was rendered — leaving
 * a stale header, and a game page still playing as a member the server now treats as a spectator.
 */
function resyncMemberInfo(): void {
	const previousUserId = getOurUserId();
	readMemberInfoCookie();
	// Matches on the initial page load: the cookie this reads is the one the page was rendered from.
	if (getOurUserId() !== previousUserId) navigate.reload();
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

/** Resets our member info variables as if we were logged out. */
function resetMemberInfo(): void {
	clearTimeout(sessionExpiryTimer); // Prevent ghost logout events after we've manually reset
	memberInfo = { signedIn: false };
}

// Session End -----------------------------------------------------------------

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
 * Cleans up local auth state, then reloads the page to reflect the logged-out state.
 * Cleanup cancels the session-expiry timer so it can't fire again after the reset.
 */
function reloadAfterLogout(): void {
	docutil.deleteCookie('memberInfo');
	resetMemberInfo();
	navigate.reload();
}

// Getters ---------------------------------------------------------------------

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

// Exports ---------------------------------------------------------------------

export default {
	// Session End
	reloadAfterLogout,
	// Getters
	areWeLoggedIn,
	getOurUsername,
	getOurUserId,
};
