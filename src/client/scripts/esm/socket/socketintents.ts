// src/client/scripts/esm/socket/socketintents.ts

/**
 * Delivery layer for user-triggered socket messages ("intents").
 *
 * An intent must survive a disconnect — a click shouldn't vanish because the socket happened
 * to be down — but it must not be replayed blindly either, since by the time we reconnect the
 * state it was meant for may have moved on (the game ended, someone else took our seek). So an
 * intent that can't go out right now is held, and re-checked against the server's authoritative
 * state the moment its route resyncs.
 *
 * An intent also stays outstanding until the server acks it, and a second intent for the same
 * action can't be submitted meanwhile. Without that, impatient clicking sends an action several
 * times, and the server answers the duplicates against a world the first one already changed
 * ("You are already in a game").
 *
 * Protocol traffic (echoes, sub/unsub, resubscribing, move submission) bypasses this and uses
 * socketsend.send() directly — deferring the messages the resync itself depends on would
 * deadlock, and moves have their own reconciliation in resyncer.
 */

import type { Exact } from '../../../../shared/util/socketutil.js';
import type { SubscribedRoute } from './socketsubs.js';
import type { MessageID, OutAction, OutValue } from './socketsend.js';

import socketsend from './socketsend.js';
import { SocketBus } from './SocketBus.js';
import socketconnection from './socketconnection.js';

// Types -----------------------------------------------------------------------

/**
 * What an intent locks while it's outstanding: its route and action. Nothing here needs a
 * finer lock — every intent is an action a user can only mean once at a time (you enter one
 * game, own one seek, resign one game), and the actions that do repeat rapidly, moves above
 * all, aren't intents.
 */
type IntentKey = `${SubscribedRoute}/${string}`;

/** A user-triggered message held until its route can accept it. */
type Intent = {
	/** Bound at submission, while the message's route/action/value are still in hand. */
	send: () => Promise<void>;
	isStillValid: () => boolean;
	/** Epoch ms past which the user has mentally moved on, and we silently drop it. */
	expiresAt: number;
	/**
	 * The lock this intent holds. Once sent, its ack is what frees the lock;
	 * carried here so an intent dropped while still held can free it instead.
	 */
	key: IntentKey;
};

// Constants -------------------------------------------------------------------

/**
 * How long a held intent stays eligible to send. Past this the user has long since
 * assumed their click didn't register, and would be surprised to see it take effect.
 * A backstop only — correctness comes from each intent's validity check, not from this.
 */
const INTENT_LIFETIME_MS = 10000;

// Variables -------------------------------------------------------------------

/** Intents held per route, in submission order. Only ever non-empty while that route is out of sync. */
const held: Record<SubscribedRoute, Intent[]> = { lobby: [], game: [] };

/**
 * Which routes we currently hold the server's authoritative state for.
 * Being subscribed isn't enough — an intent's validity check reads that state.
 */
const synced: Record<SubscribedRoute, boolean> = { lobby: false, game: false };

/**
 * The locks of intents the server hasn't finished with, mapped to the id of the message
 * carrying them — absent until one is actually on the wire. A key present here rejects
 * further submissions of that action, so one click can't be sent twice.
 */
const outstanding = new Map<IntentKey, MessageID | undefined>();

// Events ----------------------------------------------------------------------

// Whatever state we held is stale the moment the connection drops. Held intents
// deliberately survive this — they're what the next resync re-evaluates.
SocketBus.addEventListener('closed', () => {
	for (const route of Object.keys(synced) as SubscribedRoute[]) synced[route] = false;
	// A message sent but never acked may or may not have been handled before the socket died.
	// Rather than guess, unlock: the user is free to act again, and the resync that follows
	// replaces whatever they were acting on with the server's own state.
	for (const [key, sentAs] of outstanding) if (sentAs !== undefined) release(key);
	SocketBus.dispatch('intents'); // The routes are no longer ready, so anything gated on that re-derives.
});

// Locks -----------------------------------------------------------------------

/** Whether an action is submitted but not yet answered — what a button pending on it reads. */
function isOutstanding(route: SubscribedRoute, action: string): boolean {
	return outstanding.has(`${route}/${action}`);
}

/** Locks an action, announcing the change so anything pending on it re-derives. */
function lock(key: IntentKey): void {
	outstanding.set(key, undefined);
	SocketBus.dispatch('intents');
}

/** Releases an action's lock, if it holds one, announcing the change. */
function release(key: IntentKey): void {
	if (!outstanding.delete(key)) return;
	SocketBus.dispatch('intents');
}

// Functions -------------------------------------------------------------------

/**
 * Sends a user-triggered message, or holds it until its route is back in sync.
 *
 * At most one intent per action is outstanding at a time: submitting an action already on
 * its way to the server does nothing, while submitting one still held replaces what's held,
 * so what goes out on resync is the last thing the user asked for.
 * @param isStillValid - Re-checked against the server's state before a held intent goes out.
 * Return false once the action no longer makes sense and it's dropped instead.
 */
function submit<R extends SubscribedRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
	isStillValid: () => boolean,
): void {
	const key: IntentKey = `${route}/${action}`;
	const intent: Intent = {
		// Records the id it goes out under, so the ack for it can release the lock. One that
		// couldn't be sent at all is released right away — nothing is coming back to release it.
		send: async () => {
			const messageID = await socketsend.send(route, action, value, true);
			// Couldn't go out, so nothing is coming back to release it. Otherwise it stays
			// locked and merely learns the id it's waiting on, which no one needs to hear.
			if (messageID === undefined) release(key);
			else outstanding.set(key, messageID);
		},
		isStillValid,
		expiresAt: Date.now() + INTENT_LIFETIME_MS,
		key,
	};

	// Superseded rather than dropped: the held one hasn't reached the server, so the user is
	// still free to change their mind about it. Read off `held` rather than inferred from the
	// lock, which reads the same for the moment an intent spends between the two.
	const heldIndex = held[route].findIndex((i) => i.key === key);
	if (heldIndex !== -1) {
		held[route][heldIndex] = intent;
		return;
	}

	if (outstanding.has(key)) return; // Already on its way; the server owes us a reply for it.
	lock(key);

	if (isRouteReady(route)) {
		void intent.send();
		return;
	}
	// Not ready: hold it until the route resyncs, or until the user has moved on.
	held[route].push(intent);
}

/** Called when the server acks a message, releasing the key of the intent it carried. */
function onAck(messageID: MessageID): void {
	for (const [key, sentAs] of outstanding) {
		if (sentAs !== messageID) continue;
		release(key);
		return;
	}
}

/**
 * Whether a route can take a message right now: an open socket, and its state in hand.
 * Also what a button whose enablement derives from that pushed state reads.
 */
function isRouteReady(route: SubscribedRoute): boolean {
	if (!synced[route]) return false;
	// Not redundant with the sync flag: a client-initiated close() leaves the socket CLOSING
	// for a while, and `closed` (which clears the flag) only fires once it's actually shut.
	const socket = socketconnection.getSocket();
	return socket !== undefined && socket.readyState === WebSocket.OPEN;
}

/**
 * Marks a route as holding the server's authoritative state, and sends the intents held for
 * it that are still worth sending.
 *
 * MUST be called only once that state has been APPLIED, not merely received — the validity
 * checks read it. That's why this is separate from onlinegame's `inSync` flag, which is
 * set beforehand so resyncer can submit moves as it reconciles the board. The two aren't
 * redundant either: `inSync` says our move list matches the server's, and goes false
 * on a detected desync with the socket still wide open, where this stays true.
 */
function onRouteSynced(route: SubscribedRoute): void {
	synced[route] = true;
	SocketBus.dispatch('intents'); // The route is ready again, so anything gated on that re-derives.

	const intents = held[route];
	if (intents.length === 0) return;
	held[route] = [];

	const now = Date.now();
	for (const intent of intents) {
		const stale = now > intent.expiresAt; // User has moved on.
		if (stale || !intent.isStillValid()) {
			release(intent.key); // Dropped, so no ack is coming to release it.
			continue;
		}
		void intent.send();
	}
}

// Exports ---------------------------------------------------------------------

export default {
	isOutstanding,
	submit,
	isRouteReady,
	onAck,
	onRouteSynced,
};
