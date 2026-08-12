// src/server/socket/socketSubs.ts

/**
 * Owns a socket's subscriptions: attaching one to a stream, detaching it from one,
 * and detaching it from every stream at once when the socket closes.
 *
 * Counterpart of the client's socketsubs.
 */

import type { CustomWebSocket } from './socketTypes.js';

import { subToLobby, unsubFromLobby } from '../game/seeksmanager/lobbymanager.js';
import {
	unsubSocketParticipantFromGame,
	unsubSocketSpectatorFromGame,
} from '../game/gamemanager/gamemanager.js';

// Types -------------------------------------------------------------------

/** Every subscription list a socket can be attached to, each with its own detach handler run on close. */
export type SubscriptionKey = keyof CustomWebSocket['metadata']['subscriptions'];

// Subbing -------------------------------------------------------------------

function handleSubbing(ws: CustomWebSocket, value: 'lobby'): void {
	// What are they wanting to subscribe to for updates?
	switch (value) {
		case 'lobby':
			subToLobby(ws);
			break;
		default:
			console.error('UNKNOWN subscription list to subscribe client to!', value satisfies never); // prettier-ignore
	}
}

// Unsubbing -------------------------------------------------------------------

// Set involuntary to true if you don't immediately want
// to disconnect them, but say after a short forgiveness period.

/**
 * Unsubscribes a socket from a subscription list.
 * Entry points: Socket closure, or the client explicitly requested to unsub.
 * Clients may only request 'lobby' — the other keys are detached server-side.
 */
function handleUnsubbing(ws: CustomWebSocket, key: SubscriptionKey, involuntary: boolean): void {
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case 'lobby':
			unsubFromLobby(ws, involuntary);
			break;
		case 'game':
			unsubSocketParticipantFromGame(ws, involuntary);
			break;
		case 'spectating':
			// Read-only spectator: no cushion/auto-resign, just detach.
			unsubSocketSpectatorFromGame(ws);
			break;
		default:
			console.error('UNKNOWN subscription list to unsubscribe client from!', key satisfies never); // prettier-ignore
	}
}

/** The socket is closing: Unsubscribe them from all subscriptions they are in. */
function unsubSocketFromAllSubs(ws: CustomWebSocket, involuntary: boolean): void {
	const subscriptionsKeys = Object.keys(ws.metadata.subscriptions) as SubscriptionKey[];
	for (const key of subscriptionsKeys) handleUnsubbing(ws, key, involuntary);
}

// Exports ------------------------------------------------------------

export { handleSubbing, handleUnsubbing, unsubSocketFromAllSubs };
