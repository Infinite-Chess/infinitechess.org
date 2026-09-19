// src/server/game/seeksmanager/lobbySubscribers.ts

/**
 * Owns the set of sockets currently subscribed to the lobby.
 * Keeps membership in sync with each socket's lobby subscription flag and exposes
 * the audience for lobby broadcasts.
 *
 * Handles socket membership and message delivery. `lobbyManager.ts` handles subscription
 * side effects; `activeSeeks.ts` owns the seeks and their list broadcasts.
 */

import type { Exact } from '../../../shared/util/socketutil.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { OutAction, OutValue } from '../../socket/socketSend.js';

import socketSend from '../../socket/socketSend.js';

// State -----------------------------------------------------------------------

/** Set of clients currently subscribed to the lobby. */
const subscribedClients: Set<CustomWebSocket> = new Set();

// Functions -------------------------------------------------------------------

/** Returns an iterator over all sockets currently subscribed to the lobby. */
function getAll(): SetIterator<CustomWebSocket> {
	return subscribedClients.values();
}

/**
 * Broadcasts a message to all lobby subscribers.
 * KEEP. It will be used when spectating is added to the lobby.
 * @param action - The action of the socket message
 * @param message - The message contents
 */
function broadcastToAll<A extends OutAction<'lobby'>, V extends OutValue<'lobby', A>>(
	action: A,
	message: Exact<V, OutValue<'lobby', A>>,
): void {
	for (const ws of subscribedClients) {
		socketSend.send(ws, 'lobby', action, message); // In order: socket, sub, action, value
	}
}

/** Adds a new socket to the lobby subscriber list. */
function add(ws: CustomWebSocket): void {
	if (subscribedClients.has(ws))
		return console.error('Cannot sub socket to lobby because they already are!');

	subscribedClients.add(ws);
	ws.metadata.subscriptions.lobby = true;
}

/**
 * Removes a socket from the lobby subscriber list.
 * DOES NOT delete any of their existing seeks! That should be done before.
 */
function remove(ws: CustomWebSocket): void {
	if (!subscribedClients.has(ws)) return; // Cannot unsub socket from lobby because they aren't subbed.

	subscribedClients.delete(ws);
	delete ws.metadata.subscriptions.lobby;
}

/** Returns the number of sockets currently subscribed to the lobby. */
function getCount(): number {
	return subscribedClients.size;
}

// Exports ---------------------------------------------------------------------

export default {
	getAll,
	broadcastToAll,
	add,
	remove,
	getCount,
};
