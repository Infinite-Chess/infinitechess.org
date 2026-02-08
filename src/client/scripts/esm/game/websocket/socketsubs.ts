// src/client/scripts/esm/game/websocket/socketsubs.ts

/**
 * Manages subscription state for the client websocket system.
 *
 * Tracks which subscriptions (e.g. 'invites', 'game') are currently active,
 * and provides methods to add, remove, and query subscriptions.
 */

import socketmessages from './socketmessages.js';

const validSubs = ['invites', 'game'] as const;

type Sub = (typeof validSubs)[number];

const subs: Record<Sub, boolean> = {
	invites: false,
	game: false,
};

/** Returns true if we're currently not subscribed to anything. */
function zeroSubs(): boolean {
	for (const sub of validSubs) if (subs[sub] === true) return false;
	return true;
}

/**
 * Whether we are subbed to the given subscription list.
 * @param sub - The name of the sub
 */
function areSubbedToSub(sub: Sub): boolean {
	return subs[sub] !== false;
}

/**
 * Marks ourself as subscribed to a subscription list.
 * @param sub - The name of the sub to add
 */
function addSub(sub: Sub): void {
	subs[sub] = true;
}

/**
 * Marks ourself as no longer subscribed to a subscription list.
 *
 * If our websocket happens to close unexpectedly, we won't re-subscribe to it.
 * @param sub - The name of the sub to delete
 */
function deleteSub(sub: Sub): void {
	subs[sub] = false;
}

/**
 * Unsubs from the provided subscription list,
 * informing the server we no longer want updates.
 * @param sub - The name of the sub to unsubscribe from
 */
function unsubFromSub(sub: Sub): void {
	if (!areSubbedToSub(sub)) return; // Already unsubbed.
	deleteSub(sub);
	// Tell the server we no longer want updates.
	socketmessages.send('general', 'unsub', sub);
}

// Exports --------------------------------------------------------------------

export default {
	validSubs,
	zeroSubs,
	areSubbedToSub,
	addSub,
	deleteSub,
	unsubFromSub,
};
