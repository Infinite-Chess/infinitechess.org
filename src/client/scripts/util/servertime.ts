// src/client/scripts/util/servertime.ts

/**
 * The server's clock, for the absolute times the client compares or persists, since the user's
 * system clock can be set to anything. Read off the `<html data-server-time>` stamp of each page
 * render, then advanced by `Date.now()` — not `performance.now()`, which stalls during system
 * sleep on some platforms — so a clock change mid-page goes uncorrected until the next page load.
 *
 * Reads behind by however long the page took to load, often several hundred ms and up to seconds:
 * never use it for sub-second timing.
 */

// Constants -------------------------------------------------------------------

/** How far the server's clock is ahead of ours. */
const OFFSET_MS = Number(document.documentElement.dataset['serverTime']) - Date.now();

// Functions -------------------------------------------------------------------

/** The server's current time, in milliseconds since the epoch. */
function now(): number {
	return Date.now() + OFFSET_MS;
}

// Exports ---------------------------------------------------------------------

export default { now };
