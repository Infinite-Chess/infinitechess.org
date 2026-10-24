// src/client/scripts/socket/socketlogger.ts

/**
 * Owns debug mode and prints the socket traffic it enables.
 *
 * Counterpart of the server's socketLogger, which writes to log files unconditionally.
 * Ours is a dev toggle: off, nothing is printed and no latency is simulated.
 */

import type { ClientboundMessage } from '../../../shared/transport/clientbound.js';

// Constants -------------------------------------------------------------------

/** Whether to also print incoming echos. They're frequent and rarely what you're debugging. */
const PRINT_ECHOS = false;

// State -----------------------------------------------------------------------

/** Enables simulated websocket latency and prints all sent and received messages. */
let debug = false;

// Debug Mode ------------------------------------------------------------------

/** Returns whether debug mode is enabled. */
function isDebugEnabled(): boolean {
	return debug;
}

/** Toggles debug mode on or off. */
function toggleDebug(): void {
	debug = !debug;
	console.log(`Toggled websocket latency: ${debug}`);
}

// Traffic ---------------------------------------------------------------------

/** Prints a message we're putting on the wire. Echos we send are never printed. */
function logOutgoing(message: string): void {
	if (debug) console.log(`Sending: ${message}`);
}

/** Prints a validated message we received. */
function logIncoming(message: ClientboundMessage): void {
	if (!debug) return;
	if (message.route === 'echo' && !PRINT_ECHOS) return;
	console.log(`Incoming message: ${JSON.stringify(message)}`);
}

// Exports ---------------------------------------------------------------------

export default {
	isDebugEnabled,
	toggleDebug,
	logOutgoing,
	logIncoming,
};
