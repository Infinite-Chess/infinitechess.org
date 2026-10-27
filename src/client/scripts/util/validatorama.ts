// src/client/scripts/util/validatorama.ts

/**
 * Exposes our login state and username/user_id, read from the `memberInfo` cookie. Auth itself
 * rides on the httpOnly refresh-token cookie (auto-sent same-site). A login or logout in one
 * tab reloads the browser's others.
 */

import type { MemberInfoCookie } from '../../../shared/types/memberinfo.js';

import timeutil from '../../../shared/util/timeutil.js';

import docutil from './docutil.js';
import navigate from './navigate.js';

// Types -----------------------------------------------------------------------

/** Our identity (the cookie payload) when signed in, else just the flag. */
type MemberInfoState = ({ signedIn: true } & MemberInfoCookie) | { signedIn: false };

// Constants -------------------------------------------------------------------

/** How often we check whether our session has ended. */
const SESSION_CHECK_INTERVAL_MS = timeutil.toMillis(1, 'minutes');

// State -----------------------------------------------------------------------

/** Pings the browser's other tabs, prompting them to re-check who they're rendered for. */
let identityChannel = openIdentityChannel();

let memberInfo: MemberInfoState = { signedIn: false };

// Initialization --------------------------------------------------------------

(function init(): void {
	initListeners();

	// Sets our memberInfo properties if we are logged in
	readMemberInfoCookie();

	// Empty payload on purpose: every tab answers by re-reading the cookie they all share.
	identityChannel.postMessage(null);

	window.setInterval(() => checkSessionExpiry(), SESSION_CHECK_INTERVAL_MS);
})();

/** Re-checks our identity whenever the page is shown, and whenever another tab pings. */
function initListeners(): void {
	// Fired on initial page load AND when hitting the back button to return.
	window.addEventListener('pageshow', (event) => {
		if (event.persisted) identityChannel = openIdentityChannel();
		resyncMemberInfo();
	});
	// A message reaching a page in the bfcache evicts it. 'pageshow' re-checks on return instead.
	window.addEventListener('pagehide', () => identityChannel.close());
}

/** Opens the channel other tabs' pings arrive on. */
function openIdentityChannel(): BroadcastChannel {
	const channel = new BroadcastChannel('identity');
	channel.addEventListener('message', resyncMemberInfo);
	return channel;
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

/** Sets our memberInfo from the `memberInfo` cookie, which is present if we have a session. */
function readMemberInfoCookie(): void {
	const parsed = parseMemberInfoCookie();
	memberInfo = parsed ? { signedIn: true, ...parsed } : { signedIn: false };
}

/** The `memberInfo` cookie's payload, or undefined if it's absent (not signed in). */
function parseMemberInfoCookie(): MemberInfoCookie | undefined {
	const encodedMemberInfo = docutil.getCookieValue('memberInfo');
	if (!encodedMemberInfo) return undefined;
	// Decode the URL-encoded string (cookies can't hold the special characters of raw JSON).
	return JSON.parse(decodeURIComponent(encodedMemberInfo));
}

// Session End -----------------------------------------------------------------

/** Reloads as signed out once our session has ended: its cookie gone, or past its expiry. */
function checkSessionExpiry(): void {
	if (!memberInfo.signedIn) return;
	const info = parseMemberInfoCookie();
	if (info !== undefined && info.expires > Date.now()) return; // Still live, or since renewed
	console.log('Detected session expired. Reloading.');
	reloadAfterLogout();
}

/** Deletes our `memberInfo` cookie, then reloads the page to reflect the logged-out state. */
function reloadAfterLogout(): void {
	docutil.deleteCookie('memberInfo');
	memberInfo = { signedIn: false };
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
};
