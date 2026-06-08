// src/client/scripts/esm/util/flashToast.ts

/**
 * Cross-navigation "flash" toasts: queue a message on one page, then show it once
 * on the next page load (e.g. after a redirect). Backed by sessionStorage so it
 * survives the navigation and fires exactly once.
 */

import toast from '../components/toast.js';

/** sessionStorage key holding a pending flash-toast message. */
const STORAGE_KEY = 'flashToast';

/** Queues a toast to be shown on the next page load (after a redirect/navigation). */
function queue(text: string): void {
	sessionStorage.setItem(STORAGE_KEY, text);
}

/** Shows and clears any queued flash toast. Call once on page load. */
function consume(): void {
	const text = sessionStorage.getItem(STORAGE_KEY);
	if (text === null) return;
	sessionStorage.removeItem(STORAGE_KEY);
	toast.show(text);
}

export default { queue, consume };
