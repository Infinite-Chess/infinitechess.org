// src/server/socket/sendSocketMessage.ts

/**
 * This script sends socket messages,
 * and regularly sends messages by itself to confirm the socket is still connected and responding (we will hear an echo).
 */

import type { Exact } from '../../shared/util/wsutil.js';
import type { CustomWebSocket } from './socketUtility.js';
import type {
	ClientboundGameMessage,
	ClientboundGeneralMessage,
	ClientboundLobbyMessage,
} from '../../shared/clientbound.js';

import { WebSocket } from 'ws';

import uuid from '../../shared/util/uuid.js';
import wsutil from '../../shared/util/wsutil.js';

import { logReqWebsocketOut } from './wsLogger.js';
import { addTimeoutToEchoTimers, deleteEchoTimerForMessageID } from './echoTracker.js';

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
export type OutAction<R extends OutRoute> = OutMessages[R]['action'];

/** The value an action carries, or `undefined` for the actions that carry none. */
export type OutValue<R extends OutRoute, A extends OutAction<R>> =
	Extract<OutMessages[R], { action: A }> extends { value: infer V } ? V : undefined;

// Variables ---------------------------------------------------------------------------

/**
 * The amount of latency to add to websocket replies, in millis. ONLY USE IN DEV!!
 * I recommend 2 seconds of latency for testing slow networks.
 */
const simulatedWebsocketLatencyMillis = 0;
// const simulatedWebsocketLatencyMillis = 1000; // 1 Second
// const simulatedWebsocketLatencyMillis = 2000; // 2 Seconds
if (process.env['NODE_ENV'] !== 'development' && simulatedWebsocketLatencyMillis !== 0) {
	throw new Error('simulatedWebsocketLatencyMillis must be 0 in production!!');
}

// Sending Messages ---------------------------------------------------------------------------

/**
 * Sends a message to this websocket's client.
 * @param ws - The websocket
 * @param route - What subscription/route this message should be forwarded to.
 * @param action - What type of action the client should take within the subscription route.
 * @param value - The contents of the message. `undefined` for actions that carry none.
 * @param [options] - Additional options for sending the message.
 * @param [options.skipLatency=false] - If true, we send the message immediately, without waiting for simulated latency again.
 */
function sendSocketMessage<R extends OutRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	ws: CustomWebSocket,
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
	{ skipLatency }: { skipLatency?: boolean } = {},
): void {
	// If we're applying simulated latency delay, set a timer to send this message.
	if (simulatedWebsocketLatencyMillis !== 0 && !skipLatency) {
		setTimeout(() => {
			sendSocketMessage(ws, route, action, value, { skipLatency: true });
		}, simulatedWebsocketLatencyMillis);
		return;
	}

	// Sends on a CLOSING/CLOSED socket are silently dropped by ws, so return
	// early instead of logging the message as sent and arming an echo timer.
	// Occasionally happens on dev at least for the `viewercount` action.
	if (ws.readyState !== WebSocket.OPEN) return;

	const id = uuid.generateNumbID(10);
	const stringifiedPayload = JSON.stringify({ route, contents: { action, value }, id });

	// console.log(`Sending: ${stringifiedPayload}`);

	ws.send(stringifiedPayload); // Send the message
	logReqWebsocketOut(ws, stringifiedPayload); // Log the sent message

	// Set a timer. At the end, if we have heard no echo, just assume they've disconnected, terminate the socket.
	const timeout = setTimeout(() => {
		ws.close(1014, 'No echo heard');
		deleteEchoTimerForMessageID(id);
	}, wsutil.ECHO_TIMEOUT); // We pass in an arrow function so it doesn't lose scope of ws.
	addTimeoutToEchoTimers(id, timeout);

	rescheduleHeartbeatTimer(ws);
}

/**
 * Acknowledges a message the client sent us.
 * Echoes are never echoed back, so they skip the id, echo timer,
 * and out-logging {@link sendSocketMessage} attaches.
 */
function sendEcho(ws: CustomWebSocket, id: number): void {
	if (ws.readyState !== WebSocket.OPEN) return; // Sends on a CLOSING/CLOSED socket are silently dropped by ws.

	const stringifiedPayload = JSON.stringify({ route: 'echo', contents: id });
	if (simulatedWebsocketLatencyMillis !== 0) {
		setTimeout(() => ws.send(stringifiedPayload), simulatedWebsocketLatencyMillis);
	} else ws.send(stringifiedPayload);
}

// Heartbeat Ping-Pong ----------------------------------------------------------

/**
 * Reschedule the timer to send an empty message to the client
 * to verify they are still connected and responding.
 */
function rescheduleHeartbeatTimer(ws: CustomWebSocket): void {
	cancelHeartbeatTimer(ws);
	ws.metadata.heartbeatTimerID = setTimeout(
		() => sendSocketMessage(ws, 'general', 'ping', undefined),
		wsutil.HEARTBEAT_INTERVAL_MS,
	);
}

function cancelHeartbeatTimer(ws: CustomWebSocket): void {
	clearTimeout(ws.metadata.heartbeatTimerID);
	ws.metadata.heartbeatTimerID = undefined;
}

export { sendSocketMessage, sendEcho, rescheduleHeartbeatTimer, cancelHeartbeatTimer };
