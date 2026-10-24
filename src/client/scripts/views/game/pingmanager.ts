// src/client/scripts/views/game/pingmanager.ts

/**
 * Tracks the socket's latest round-trip time, so clock values and chat timestamps the server
 * sent can be adjusted for the time they spent in transit.
 */

import { SocketBus } from '../../socket/SocketBus.js';

// State -----------------------------------------------------------------------

/** The latest round-trip time, in milliseconds. 0 while there is no socket. */
let currentPing = 0;

// Listeners -------------------------------------------------------------------

SocketBus.addEventListener('ping', (event) => (currentPing = event.detail));
SocketBus.addEventListener('closed', () => (currentPing = 0));

// Functions -------------------------------------------------------------------

/**
 * Returns half the current ping value. This will approximately
 * be the time it takes for a one-way websocket message.
 */
function getHalfPing(): number {
	return currentPing / 2;
}

// Exports ---------------------------------------------------------------------

export default { getHalfPing };
