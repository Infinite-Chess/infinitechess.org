// src/client/scripts/esm/socket/SocketBus.ts

/**
 * Typed event bus for all websocket-related events.
 * Covers both socket lifecycle events and incoming server messages.
 * socketreceive dispatches incoming messages onto it; handlers self-register by listening.
 */

import type {
	ClientboundLobbyMessage,
	ClientboundGameMessage,
} from '../../../../shared/clientbound.js';

import { EventBus } from '../../../../shared/util/EventBus.js';

interface SocketBusEvents {
	// --- Socket lifecycle ---
	opening: void;
	/** The socket closed, for any reason. */
	closed: void;
	/** The socket closed involuntarily and we'll attempt to reconnect. Always dispatched right after `closed`. */
	'connection-lost': void;
	/** RRT (Round Trip Time) ping value in milliseconds. */
	ping: number;
	/** Dispatched when application code should attempt to re-subscribe to what they need. */
	reconnect: void;
	/**
	 * Intent-layer state changed — an intent was submitted or answered/released,
	 * or a route's readiness flipped. Anything deriving its appearance from a pending
	 * action or from the server state a route holds (a disabled button) re-derives.
	 */
	intents: void;

	// --- Incoming server messages ---
	lobby: ClientboundLobbyMessage;
	game: ClientboundGameMessage;
}

export const SocketBus: EventBus<SocketBusEvents> = new EventBus<SocketBusEvents>();
