// src/server/socket/socketClose.ts

/**
 * This script handles cleanup after a websocket has closed.
 */

import type { CustomWebSocket } from './socketTypes.js';

import socketutil from '../../shared/util/socketutil.js';

import socketsend from './socketSend.js';
import socketSubs from './socketSubs.js';
import socketRegistry from './socketRegistry.js';

/** Tears a closed websocket down: unregisters it, unsubscribes all its subscriptions, clears timers. */
export function onclose(ws: CustomWebSocket, code: number, reason: Buffer): void {
	const reasonString = reason.toString();

	// Delete connection from object.
	socketRegistry.remove(ws);

	// True if client had no power over the closure,
	// DON'T COUNT this as a disconnection!
	// They would want to keep their seek, AND remain in their game!
	const involuntary = socketutil.wasSocketClosureInvoluntary(code, reasonString);

	// Unsubscribe them from all. NO LIST. It doesn't matter if they want to keep their seek or remain
	// connected to their game, without a websocket to send updates to, there's no point in any
	// SUBSCRIPTION service! Unsubbing them from their game will start their disconnect claim timer.
	socketSubs.unsubFromAll(ws, involuntary);

	socketsend.clearPendingState(ws);
}
