// src/server/socket/socketClose.ts

/**
 * This script handles cleanup after a websocket has closed.
 */

import type { CustomWebSocket } from './socketTypes.js';

import socketutil from '../../shared/util/socketutil.js';

import { clearPendingState } from './socketSend.js';
import { unsubSocketFromAllSubs } from './socketSubs.js';
import { removeConnectionFromConnectionLists } from './socketRegistry.js';

// Functions ---------------------------------------------------------------------------

function onclose(ws: CustomWebSocket, code: number, reason: Buffer): void {
	const reasonString = reason.toString();

	// Delete connection from object.
	removeConnectionFromConnectionLists(ws);

	// What if the code is 1000, and reason is "Connection closed by client"?
	// I then immediately want to delete their seek.
	// But what other reasons could it close... ?
	// Code 1006, Message "" is just a network failure.

	// True if client had no power over the closure,
	// DON'T COUNT this as a disconnection!
	// They would want to keep their seek, AND remain in their game!
	const involuntary = socketutil.wasSocketClosureInvoluntary(code, reasonString);

	// Unsubscribe them from all. NO LIST. It doesn't matter if they want to keep their seek or remain
	// connected to their game, without a websocket to send updates to, there's no point in any
	// SUBSCRIPTION service! Unsubbing them from their game will start their disconnect claim timer.
	unsubSocketFromAllSubs(ws, involuntary);

	clearPendingState(ws);
}

export { onclose };
