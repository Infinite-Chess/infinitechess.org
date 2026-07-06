// src/client/scripts/esm/websocket/SocketBus.ts

/**
 * Typed event bus for all websocket-related events.
 * Covers both socket lifecycle events and incoming server messages.
 * socketrouter dispatches incoming messages onto it; handlers self-register by listening.
 */

import type { LobbyMessage, GameMessage } from './socketschemas.js';

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
	reconnected: void;

	// --- Incoming server messages ---
	lobby: LobbyMessage;
	game: GameMessage;
}

export const SocketBus: EventBus<SocketBusEvents> = new EventBus<SocketBusEvents>();
