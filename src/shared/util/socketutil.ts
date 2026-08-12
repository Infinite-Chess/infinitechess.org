// src/shared/util/socketutil.ts

/*
 * This script should contain utility methods regarding
 * sockets that both the CLIENT and server can use.
 */

// Types -------------------------------------------------------------------------------------

/**
 * Constrains a value to EXACTLY `Shape`, rejecting undeclared properties.
 *
 * TypeScript's own excess property check only fires on fresh object literals, so a message
 * built into a variable first would smuggle extra properties onto the wire. Applied to a
 * send function's value parameter, this catches them however the caller assembled the value.
 */
export type Exact<V, Shape> = V & { [K in keyof V]: K extends keyof Shape ? V[K] : never };

/**
 * A map of route name → the union of messages that route carries.
 * Each side declares its own for the direction it sends.
 */
export type MessageMap = Record<string, { action: string }>;

/** The actions valid on a given route of `M`. */
export type RouteAction<M extends MessageMap, R extends keyof M> = M[R]['action'];

/** The value an action carries, or `undefined` for the actions that carry none. */
export type ActionValue<M extends MessageMap, R extends keyof M, A extends RouteAction<M, R>> =
	Extract<M[R], { action: A }> extends { value: infer V } ? V : undefined;

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
// 1008 "Logged out"  (Logging out, deleting the account, or resetting the password)
// 1009 "Too Many Requests"
// 1009 "Too Many Sockets"
// 1009 ""  Message exceeded MAX_PAYLOAD_BYTES (see socketServer.ts). The `ws` library
//          closes it itself, before the payload is buffered, so it sends no reason.

// Sent by the client:
// 1000 "Connection closed by client"
// 1000 "Connection closed by client. Renew."

// Sent by neither:
// 1006 ""  Network error, the server is down, or the server terminated a socket that stopped echoing.
// 1001 ""  Endpoint going away. (Closed tab without performing cleanup)

// The only closure codes reachable here, and what produces them.
// The spec defines more (1003, 1010-1013, 1015), but nothing on either side ever sends them.

// 1000: Normal closure. Every reason above we close with 1000.
// 1001: Endpoint going away. The tab closed without running our cleanup.
// 1002: Protocol error. The `ws` library rejecting a malformed frame.
// 1006: Abnormal closure. A network interruption, the server is down, or the server terminated
//       a socket that stopped echoing. Reserved — never sent on the wire, only surfaced locally.
// 1007: Invalid payload data. The `ws` library rejecting invalid UTF-8.
// 1008: Policy violation. Every reason above we close with 1008.
// 1009: Message too big. Our request/socket limits, plus the `ws` receiver's maxPayload.

// These are the closure reasons where we will RETAIN their seek for a set amount of time before deleting it by disconnection!
// We will also give them 5 seconds to reconnect before we tell their opponent they have disconnected.
// If the closure code is NOT one of the ones below, it means they purposefully closed the socket (like closed the tab),
// so IMMEDIATELY tell their opponent they disconnected!
const involuntaryClosureCodes: number[] = [1006];
const involuntaryClosureReasons: string[] = [
	'Connection expired',
	'Too Many Sockets',
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
