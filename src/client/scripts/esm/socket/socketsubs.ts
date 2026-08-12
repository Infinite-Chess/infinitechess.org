// src/client/scripts/esm/socket/socketsubs.ts

/**
 * Manages subscription state for the client websocket system.
 *
 * Tracks which subscriptions (e.g. 'lobby', 'game') are currently active,
 * and provides methods to add, remove, and query subscriptions.
 *
 * Counterpart of the server's socketSubs, which holds the authoritative side.
 */

import socketsend from './socketsend.js';

/** The routes carrying a server-pushed stream we subscribe to. Excludes 'general', the protocol route. */
export type SubscribedRoute = 'lobby' | 'game';

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
 * Whether we are subbed to the given subscription route.
 * @param sub - The name of the sub
 */
function isSubbedTo(sub: SubscribedRoute): boolean {
	return subs[sub];
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
 * Detaches from the lobby's stream, informing the server we no longer want updates.
 * The only stream detachable in place — a game's ends with the socket.
 */
function unsubFromLobby(): void {
	if (!isSubbedTo('lobby')) return; // Already unsubbed.
	deleteSub('lobby');
	// Tell the server we no longer want updates.
	void socketsend.send('general', 'unsub', 'lobby');
}

// Exports --------------------------------------------------------------------

export default {
	zeroSubs,
	isSubbedTo,
	addSub,
	deleteSub,
	clearAllSubs,
	unsubFromLobby,
};
