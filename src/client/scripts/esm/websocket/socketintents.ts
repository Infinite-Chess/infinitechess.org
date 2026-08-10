// src/client/scripts/esm/websocket/socketintents.ts

/**
 * Delivery layer for user-triggered socket messages ("intents").
 *
 * An intent must survive a disconnect — a click shouldn't vanish because the socket happened
 * to be down — but it must not be replayed blindly either, since by the time we reconnect the
 * state it was meant for may have moved on (the game ended, someone else took our seek). So an
 * intent that can't go out right now is held, and re-checked against the server's authoritative
 * state the moment its route resyncs.
 *
 * Protocol traffic (echoes, sub/unsub, resubscribing, move submission) bypasses this and uses
 * socketmessages.send() directly — deferring the messages the resync itself depends on would
 * deadlock, and moves have their own reconciliation in resyncer.
 */

import type { Sub } from './socketsubs.js';
import type { Exact } from '../../../../shared/util/wsutil.js';
import type { OutAction, OutValue } from './socketmessages.js';

import socketman from './socketman.js';
import { SocketBus } from './SocketBus.js';
import socketmessages from './socketmessages.js';

// Types -----------------------------------------------------------------------

/** A user-triggered message held until its route can accept it. */
type Intent = {
	/** Bound at submission, while the message's route/action/value are still in hand. */
	send: () => void;
	isStillValid: () => boolean;
	/** Epoch ms past which the user has mentally moved on, and we silently drop it. */
	expiresAt: number;
};

// Constants -------------------------------------------------------------------

/**
 * How long a held intent stays eligible to send. Past this the user has long since
 * assumed their click didn't register, and would be surprised to see it take effect.
 * A backstop only — correctness comes from each intent's validity check, not from this.
 */
const INTENT_LIFETIME_MILLIS = 10000;

// Variables -------------------------------------------------------------------

/** Intents held per route, in submission order. Only ever non-empty while that route is out of sync. */
const held: Record<Sub, Intent[]> = { lobby: [], game: [] };

/**
 * Which routes we currently hold the server's authoritative state for.
 * Being subscribed isn't enough — an intent's validity check reads that state.
 */
const synced: Record<Sub, boolean> = { lobby: false, game: false };

// Events ----------------------------------------------------------------------

// Whatever state we held is stale the moment the connection drops. Held intents
// deliberately survive this — they're what the next resync re-evaluates.
SocketBus.addEventListener('closed', () => {
	for (const route of Object.keys(synced) as Sub[]) synced[route] = false;
});

// Functions -------------------------------------------------------------------

/**
 * Sends a user-triggered message, or holds it until its route is back in sync.
 * @param isStillValid - Re-checked against the server's state before a held intent goes out.
 * Return false once the action no longer makes sense and it's dropped instead.
 */
function submit<R extends Sub, A extends OutAction<R>, V extends OutValue<R, A>>(
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
	isStillValid: () => boolean,
): void {
	if (isRouteReady(route)) {
		void socketmessages.send(route, action, value);
		return;
	}
	// Not ready: hold it until the route resyncs, or until the user has moved on.
	held[route].push({
		send: () => void socketmessages.send(route, action, value),
		isStillValid,
		expiresAt: Date.now() + INTENT_LIFETIME_MILLIS,
	});
}

/** Whether a route can take a message right now: an open socket, and its state in hand. */
function isRouteReady(route: Sub): boolean {
	if (!synced[route]) return false;
	// Not redundant with the sync flag: a client-initiated close() leaves the socket CLOSING
	// for a while, and `closed` (which clears the flag) only fires once it's actually shut.
	const socket = socketman.getSocket();
	return socket !== undefined && socket.readyState === WebSocket.OPEN;
}

/**
 * Marks a route as holding the server's authoritative state, and sends the intents held for
 * it that are still worth sending.
 *
 * MUST be called only once that state has been APPLIED, not merely received — the validity
 * checks read it. That's why this is separate from onlinegame's `inSync` flag, which has to
 * be set beforehand so resyncer can submit moves as it reconciles the board.
 */
function onRouteSynced(route: Sub): void {
	synced[route] = true;

	const intents = held[route];
	if (intents.length === 0) return;
	held[route] = [];

	const now = Date.now();
	for (const intent of intents) {
		if (now > intent.expiresAt) continue; // User has moved on.
		if (!intent.isStillValid()) continue; // No longer makes sense.
		intent.send();
	}
}

// Exports ---------------------------------------------------------------------

export default {
	submit,
	onRouteSynced,
};
