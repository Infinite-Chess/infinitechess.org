// src/client/scripts/esm/util/navigate.ts

/**
 * Page navigations the app decides on by itself, so a leave-the-page prompt knows not to
 * interrupt them — a superseding tab, a protocol bump, a revoked session. One the user asked
 * for, even where a click routes it through JS (Logout, picking a language), is theirs to
 * confirm and keeps using `window.location` directly.
 */

// State -----------------------------------------------------------------------

/** Whether a navigation the app started is under way. */
let appInitiated: boolean = false;

// Listeners -------------------------------------------------------------------

// A bfcache restore returns this flag intact, long after its navigation ended — left set,
// it suppresses every later leave-the-page prompt.
window.addEventListener('pageshow', (event) => {
	if (event.persisted) appInitiated = false;
});

// Functions -------------------------------------------------------------------

/** Sends the browser to a URL on the app's behalf. */
function assign(url: string): void {
	appInitiated = true;
	window.location.assign(url);
}

/** Reloads the page on the app's behalf. */
function reload(): void {
	appInitiated = true;
	window.location.reload();
}

/** Whether the navigation now under way was started by the app rather than the user. */
function isAppInitiated(): boolean {
	return appInitiated;
}

// Exports ---------------------------------------------------------------------

export default { assign, reload, isAppInitiated };
