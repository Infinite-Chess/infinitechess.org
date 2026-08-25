// src/server/socket/socketSend.ts

/**
 * This script sends socket messages,
 * and regularly sends messages by itself to confirm the socket is still connected and responding (we will hear an echo).
 *
 * It also owns the echo timers each sent message arms, closing the socket if the echo never arrives.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ActionValue, Exact, RouteAction } from '../../shared/util/socketutil.js';
import type {
	ClientboundGameMessage,
	ClientboundGeneralMessage,
	ClientboundLobbyMessage,
} from '../../shared/transport/clientbound.js';

import { WebSocket } from 'ws';

import uuid from '../../shared/util/uuid.js';
import socketutil from '../../shared/util/socketutil.js';

import socketLogger from './socketLogger.js';

// Types --------------------------------------------------------------------------------------

/** Every message we may send, keyed by the route it goes out on. */
type OutMessages = {
	general: ClientboundGeneralMessage;
	lobby: ClientboundLobbyMessage;
	game: ClientboundGameMessage;
};

/** A route we may send on. */
export type OutRoute = keyof OutMessages;

/** The actions valid on a given route. */
export type OutAction<R extends OutRoute> = RouteAction<OutMessages, R>;

/** The value an action carries, or `undefined` for the actions that carry none. */
export type OutValue<R extends OutRoute, A extends OutAction<R>> = ActionValue<OutMessages, R, A>;

// Constants ----------------------------------------------------------------------------------

/**
 * The amount of latency to add to websocket replies, in millis. ONLY USE IN DEV!!
 * I recommend 2 seconds of latency for testing slow networks.
 */
const SIMULATED_WEBSOCKET_LATENCY_MS = 0;
// const SIMULATED_WEBSOCKET_LATENCY_MS = 1000; // Debug: 1 Second
if (process.env['NODE_ENV'] !== 'development' && SIMULATED_WEBSOCKET_LATENCY_MS !== 0) {
	throw new Error('SIMULATED_WEBSOCKET_LATENCY_MS must be 0 in production!!');
}

// Sending Messages ---------------------------------------------------------------------------

/**
 * Sends a message to this websocket's client.
 * @param [options.skipLatency=false] - If true, we send the message immediately,
 *   without waiting for simulated latency again.
 */
function send<R extends OutRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	ws: CustomWebSocket,
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
	{ skipLatency }: { skipLatency?: boolean } = {},
): void {
	// If we're applying simulated latency delay, set a timer to send this message.
	if (SIMULATED_WEBSOCKET_LATENCY_MS !== 0 && !skipLatency) {
		setTimeout(
			() => send(ws, route, action, value, { skipLatency: true }),
			SIMULATED_WEBSOCKET_LATENCY_MS,
		);
		return;
	}

	// Sends on a CLOSING/CLOSED socket are silently dropped by ws, so return
	// early instead of logging the message as sent and arming an echo timer.
	// Occasionally happens on dev at least for the `viewercount` action.
	if (ws.readyState !== WebSocket.OPEN) return;

	const id = uuid.generateNumbID(10);
	const stringifiedPayload = JSON.stringify({ route, contents: { action, value }, id });

	ws.send(stringifiedPayload);
	socketLogger.logOut(ws, stringifiedPayload);

	// Set a timer. At the end, if we have heard no echo, just assume they've disconnected, terminate the socket.
	// terminate() and not close(): a closing handshake with a peer we have already concluded is
	// unreachable can only stall the 'close' event, and every consequence of the disconnection —
	// dropping their subscriptions, telling their opponent — waits on that event.
	ws.metadata.echoTimers[id] = setTimeout(() => {
		delete ws.metadata.echoTimers[id];
		ws.terminate();
	}, socketutil.ECHO_TIMEOUT_MS); // We pass in an arrow function so it doesn't lose scope of ws.

	rescheduleHeartbeatTimer(ws);
}

/**
 * Sends a bare receipt for a message the client sent us: an `echo` the moment it arrives,
 * proving the socket is alive, and an `ack` once we've finished handling it, proving the
 * action landed. Receipts are never echoed back, so they skip the id, echo timer, and
 * out-logging {@link send} attaches.
 */
function receipt(ws: CustomWebSocket, route: 'echo' | 'ack', id: number): void {
	if (ws.readyState !== WebSocket.OPEN) return; // Sends on a CLOSING/CLOSED socket are silently dropped by ws.

	const stringifiedPayload = JSON.stringify({ route, contents: id });
	if (SIMULATED_WEBSOCKET_LATENCY_MS !== 0) {
		setTimeout(() => ws.send(stringifiedPayload), SIMULATED_WEBSOCKET_LATENCY_MS);
	} else ws.send(stringifiedPayload);
}

// Echo Timers --------------------------------------------------------------------------------

/**
 * Cancels the timer that closes the socket when we
 * don't hear the expected echo for a message we sent it.
 */
function cancelEchoTimer(ws: CustomWebSocket, messageID: number): void {
	// An echo can occasionally arrive after ECHO_TIMEOUT_MS has elapsed — the timer
	// has already fired and deleted itself, so there's nothing left to cancel.
	clearTimeout(ws.metadata.echoTimers[messageID]);
	delete ws.metadata.echoTimers[messageID];
}

/** Cancels every echo timer still pending on the socket. */
function cancelAllEchoTimers(ws: CustomWebSocket): void {
	for (const timeout of Object.values(ws.metadata.echoTimers)) clearTimeout(timeout);
	ws.metadata.echoTimers = {};
}

// Heartbeat Ping-Pong ------------------------------------------------------------------------

/**
 * Reschedule the timer to send an empty message to the client
 * to verify they are still connected and responding.
 */
function rescheduleHeartbeatTimer(ws: CustomWebSocket): void {
	cancelHeartbeatTimer(ws);
	ws.metadata.heartbeatTimerID = setTimeout(
		() => send(ws, 'general', 'ping', undefined),
		socketutil.HEARTBEAT_INTERVAL_MS,
	);
}

/** Cancels the pending heartbeat ping, if one is armed. */
function cancelHeartbeatTimer(ws: CustomWebSocket): void {
	clearTimeout(ws.metadata.heartbeatTimerID);
	ws.metadata.heartbeatTimerID = undefined;
}

// Teardown -----------------------------------------------------------------------------------

/** Clears all timers tied to the socket. Called when it's torn down. */
function clearPendingState(ws: CustomWebSocket): void {
	cancelAllEchoTimers(ws);
	cancelHeartbeatTimer(ws);
}

// Exports ------------------------------------------------------------------------------------

export default {
	// Sending Messages
	send,
	receipt,
	// Echo Timers
	cancelEchoTimer,
	// Heartbeat Ping-Pong
	rescheduleHeartbeatTimer,
	// Teardown
	clearPendingState,
};
