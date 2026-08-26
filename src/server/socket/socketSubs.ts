// src/server/socket/socketSubs.ts

/**
 * Owns a socket's subscriptions: attaching one to a stream, detaching it from one,
 * and detaching it from every stream at once when the socket closes.
 *
 * Counterpart of the client's socketsubs.
 */

import type { CustomWebSocket } from './socketTypes.js';

import gameManager from '../game/gamemanager/gameManager.js';
import lobbyManager from '../game/seeksmanager/lobbyManager.js';

// Types -----------------------------------------------------------------------

/** Every subscription list a socket can be attached to, each with its own detach handler run on close. */
type SubscriptionKey = keyof CustomWebSocket['metadata']['subscriptions'];

// Subbing ---------------------------------------------------------------------

/** Subscribes a socket to a stream's updates. Only 'lobby' is client-requestable. */
function sub(ws: CustomWebSocket, value: 'lobby'): void {
	// What are they wanting to subscribe to for updates?
	switch (value) {
		case 'lobby':
			lobbyManager.subscribe(ws);
			break;
		default:
			console.error('UNKNOWN subscription list to subscribe client to!', value satisfies never); // prettier-ignore
	}
}

// Unsubbing -------------------------------------------------------------------

/**
 * Unsubscribes a socket from a subscription list.
 * Entry points: Socket closure, or the client explicitly requested to unsub.
 * Clients may only request 'lobby' — the other keys are detached server-side.
 * @param involuntary - True when the socket didn't choose to leave, to give
 *   e.g. a disconnect cushion instead of an immediate teardown.
 */
function unsub(ws: CustomWebSocket, key: SubscriptionKey, involuntary: boolean): void {
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case 'lobby':
			lobbyManager.unsubscribe(ws, involuntary);
			break;
		case 'game':
			gameManager.unsubscribeParticipant(ws, involuntary);
			break;
		case 'spectating':
			// Read-only spectator: no cushion/auto-resign, just detach.
			gameManager.unsubscribeSpectator(ws);
			break;
		default:
			console.error('UNKNOWN subscription list to unsubscribe client from!', key satisfies never); // prettier-ignore
	}
}

/** The socket is closing: Unsubscribe them from all subscriptions they are in. */
function unsubFromAll(ws: CustomWebSocket, involuntary: boolean): void {
	const subscriptionsKeys = Object.keys(ws.metadata.subscriptions) as SubscriptionKey[];
	for (const key of subscriptionsKeys) unsub(ws, key, involuntary);
}

// Exports ---------------------------------------------------------------------

export default {
	// Subbing
	sub,
	// Unsubbing
	unsub,
	unsubFromAll,
};
