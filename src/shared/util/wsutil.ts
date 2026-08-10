// src/shared/util/wsutil.ts

/*
 * This script should contain utility methods regarding
 * sockets that both the CLIENT and server can use.
 */

// Constants ---------------------------------------------------------------------------------

/**
 * The version of the websocket protocol the server and client speak.
 * The server announces this the moment a socket opens. If the client's compiled-in
 * copy doesn't match, the client is running pre-protocol-change code and reloads.
 *
 * Increment by 1 whenever the socket messages change at all.
 */
const PROTOCOL_VERSION = 1;

/** How long the server waits without sending a message before sending a heartbeat ping. */
const HEARTBEAT_INTERVAL_MS = 10000;
/** How long to wait for an echo before assuming the connection is dead. */
const ECHO_TIMEOUT = 5000;

// Variables ---------------------------------------------------------------------------------

// Every closure code/reason pairing that can occur:

// Sent by the server:
// 1000 "Connection expired"  (Can read this even if we disable our own network in dev tools)
// 1008 "Origin Error"
// 1008 "Unable to identify client IP address"
// 1008 "User agent is required"  (Automated scanner and prober bots often omit it)
// 1008 "Authentication needed"  (The client has cookies disabled)
// 1008 "Logged out"  (Logging out, or deleting the account)
// 1009 "Too Many Requests"
// 1009 "Too Many Sockets"
// 1009 ""  Message exceeded MAX_PAYLOAD_BYTES (see socketServer.ts). The `ws` library
//          closes it itself, before the payload is buffered, so it sends no reason.
// 1014 "No echo heard"  (Client took too long to respond)

// Sent by the client:
// 1000 "Connection closed by client"
// 1000 "Connection closed by client. Renew."

// Sent by neither:
// 1006 ""  Network error, or the server is down
// 1001 ""  Endpoint going away. (Closed tab without performing cleanup)

// All closure codes defined by the websocket spec:

// 1000: Normal closure.
// 1001: Endpoint going away.
// 1002: Protocol error.
// 1003: Unsupported data.
// 1005: No status code received (reserved).
// 1006: Abnormal closure, no further detail available (reserved). This is usually a network interruption, OR the server is down.
// 1007: Invalid data received.
// 1008: Policy violation.
// 1009: Message too big.
// 1010: Missing extension.
// 1011: Internal server error.
// 1012: Service restart.
// 1013: Try again later.
// 1014: Bad gateway.
// 1015: TLS handshake failure (reserved).

// These are the closure reasons where we will RETAIN their seek for a set amount of time before deleting it by disconnection!
// We will also give them 5 seconds to reconnect before we tell their opponent they have disconnected.
// If the closure code is NOT one of the ones below, it means they purposefully closed the socket (like closed the tab),
// so IMMEDIATELY tell their opponent they disconnected!
const involuntaryClosureCodes: number[] = [1006];
const involuntaryClosureReasons: string[] = [
	'Connection expired',
	'Too Many Sockets',
	'No echo heard',
	'Connection closed by client. Renew.',
];

// Functions ---------------------------------------------------------------------------------

/**
 * Determines if the WebSocket closure was not initiated by the client (i.e., they had no control over the closure).
 * If this returns `true`, the client is allowed 5 seconds to reconnect before notifying their opponent of the disconnection.
 * @param code - The WebSocket closure code.
 * @param reason - The reason provided for the WebSocket closure.
 * @returns `true` if the closure was not initiated by the client, otherwise `false`.
 */
function wasSocketClosureInvoluntary(code: number, reason: string): boolean {
	return (
		involuntaryClosureCodes.includes(code) || involuntaryClosureReasons.includes(reason.trim())
	);
}

// -----------------------------------------------------------------------------------------

export default {
	PROTOCOL_VERSION,
	HEARTBEAT_INTERVAL_MS,
	ECHO_TIMEOUT,
	wasSocketClosureInvoluntary,
};
