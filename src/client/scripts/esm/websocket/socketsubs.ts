// src/client/scripts/esm/websocket/socketsubs.ts

/**
 * Manages subscription state for the client websocket system.
 *
 * Tracks which subscriptions (e.g. 'lobby', 'game') are currently active,
 * and provides methods to add, remove, and query subscriptions.
 */

import type { SubscribedRoute } from '../../../../shared/serverbound.js';

import socketmessages from './socketmessages.js';

/** Whether we are subscribed to each route's stream. */
const subs: Record<SubscribedRoute, boolean> = {
	lobby: false,
	game: false,
};

/** Returns true if we're currently not subscribed to anything. */
function zeroSubs(): boolean {
	return Object.values(subs).every((subbed) => !subbed);
}

/**
 * Whether we are subbed to the given subscription list.
 * @param sub - The name of the sub
 */
function areSubbedToSub(sub: SubscribedRoute): boolean {
	return subs[sub] !== false;
}

/**
 * Marks ourself as subscribed to a subscription list.
 * @param sub - The name of the sub to add
 */
function addSub(sub: SubscribedRoute): void {
	subs[sub] = true;
}

/**
 * Marks ourself as no longer subscribed to a subscription list.
 *
 * If our websocket happens to close unexpectedly, we won't re-subscribe to it.
 * @param sub - The name of the sub to delete
 */
function deleteSub(sub: SubscribedRoute): void {
	subs[sub] = false;
}

/**
 * Marks all subscription lists as unsubscribed.
 * Called when the websocket closes, since the server drops all subs on its side.
 */
function clearAllSubs(): void {
	for (const sub of Object.keys(subs) as SubscribedRoute[]) subs[sub] = false;
}

/**
 * Unsubs from the provided subscription list,
 * informing the server we no longer want updates.
 * @param sub - The name of the sub to unsubscribe from
 */
function unsubFromSub(sub: SubscribedRoute): void {
	if (!areSubbedToSub(sub)) return; // Already unsubbed.
	deleteSub(sub);
	// Tell the server we no longer want updates.
	void socketmessages.send('general', 'unsub', sub);
}

// Exports --------------------------------------------------------------------

export default {
	zeroSubs,
	areSubbedToSub,
	addSub,
	deleteSub,
	clearAllSubs,
	unsubFromSub,
};
