// src/client/scripts/esm/socket/socketsend.ts

/**
 * Handles outgoing websocket messages and echo tracking, and owns the inactivity
 * watchdog that drops the socket once the server has gone silent.
 *
 * This is the raw transport. User-triggered messages go through socketintents instead,
 * which holds them across a disconnect rather than letting them fall on the floor.
 */

import type { ActionValue, Exact, RouteAction } from '../../../../shared/util/socketutil.js';
import type {
	ServerboundGameMessage,
	ServerboundGeneralMessage,
	ServerboundLobbyMessage,
} from '../../../../shared/serverbound.js';

import uuid from '../../../../shared/util/uuid.js';
import socketutil from '../../../../shared/util/socketutil.js';

import socketsubs from './socketsubs.js';
import socketlogger from './socketlogger.js';
import { SocketBus } from './SocketBus.js';
import socketconnection from './socketconnection.js';

// Types -----------------------------------------------------------------------

export type MessageID = number;

/** Every message we may send, keyed by the route it goes out on. */
type OutMessages = {
	general: ServerboundGeneralMessage;
	lobby: ServerboundLobbyMessage;
	game: ServerboundGameMessage;
};

/** A route we may send on. */
type OutRoute = keyof OutMessages;

/** The actions valid on a given route. */
export type OutAction<R extends OutRoute> = RouteAction<OutMessages, R>;

/** The value an action carries, or `undefined` for the actions that carry none. */
export type OutValue<R extends OutRoute, A extends OutAction<R>> = ActionValue<OutMessages, R, A>;

// Constants -------------------------------------------------------------------

/** Simulated websocket latency in debug mode. */
const DEBUG_SOCKET_LATENCY_MS = 1000;

// Variables -------------------------------------------------------------------

/** Echo timers for sent messages awaiting acknowledgement. */
let echoTimers: Record<MessageID, { timeSent: number; timeoutID: number }> = {};

/**
 * The timeout ID for detecting server inactivity.
 * If no message is received within the expected window, the client
 * assumes the connection is dead and closes the socket.
 */
let heartbeatTimerID: number | undefined;

// Echo Tracking ---------------------------------------------------------------

/**
 * Called when we hear a server echo. Cancels the timer that assumes
 * disconnection, and updates the ping display.
 */
function cancelTimerOfMessageID(ID: number): void {
	const echoTimer = echoTimers[ID];
	if (!echoTimer) {
		console.error('Could not find echo timer for message.');
		return;
	}

	// Update the Ping meter with the round-trip time
	const timeTaken = Date.now() - echoTimer.timeSent;
	SocketBus.dispatch('ping', timeTaken);

	clearTimeout(echoTimer.timeoutID);
	delete echoTimers[ID];
}

/**
 * Drops the current websocket when an echo hasn't been heard.
 * Called a few seconds after not hearing a server echo.
 */
function onEchoTimeout(messageID: MessageID): void {
	if (messageID) delete echoTimers[messageID];
	console.log(`Renewing connection after we haven't received an echo for ${socketutil.ECHO_TIMEOUT} ms...`); // prettier-ignore
	socketconnection.dropSocket();
}

/**
 * Cancels all timers that assume disconnection.
 * Called when the socket connection is terminated.
 */
function cancelAllEchoTimers(): void {
	for (const echoTimerEntry of Object.values(echoTimers)) {
		clearTimeout(echoTimerEntry.timeoutID);
	}
	echoTimers = {};
}

// Inactivity Detection --------------------------------------------------------

/**
 * Reschedules the inactivity timer. Called on every incoming message.
 * If no message is received within a certain time frame, the client
 * assumes the connection is dead and closes the socket.
 */
function rescheduleHeartbeatTimer(): void {
	cancelHeartbeatTimer();
	if (socketsubs.zeroSubs()) return;
	heartbeatTimerID = window.setTimeout(
		onHeartbeatTimeout,
		socketutil.HEARTBEAT_INTERVAL_MS + socketutil.ECHO_TIMEOUT,
	);
}

/** Cancels the inactivity timer. Called when the socket closes. */
function cancelHeartbeatTimer(): void {
	if (heartbeatTimerID !== undefined) {
		clearTimeout(heartbeatTimerID);
		heartbeatTimerID = undefined;
	}
}

/** Clears all timers tied to the socket. Called when it's torn down. */
function clearPendingState(): void {
	cancelAllEchoTimers();
	cancelHeartbeatTimer();
}

/** Called when no message has been received within the expected time frame. Drops the socket. */
function onHeartbeatTimeout(): void {
	heartbeatTimerID = undefined;
	console.log(`No message received for ${socketutil.HEARTBEAT_INTERVAL_MS + socketutil.ECHO_TIMEOUT}ms. Assuming connection lost.`); // prettier-ignore
	socketconnection.dropSocket();
}

// Sending Messages ------------------------------------------------------------

/**
 * Sends a message to the server, lazily opening the socket if one isn't up yet.
 *
 * Fire-and-forget: a message that can't go out is dropped. Only protocol traffic belongs here —
 * anything the user asked for goes through socketintents.submit() so a disconnect can't eat it.
 * @param route - Where the server needs to forward this to.
 * @param action - What action to take within the route.
 * @param value - The contents of the message. `undefined` for actions that carry none.
 * @param needsack - Asks the server to ack this message once it has handled it.
 * @returns The id the message went out under, or undefined if it couldn't be sent.
 */
async function send<R extends OutRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
	needsack?: true,
): Promise<MessageID | undefined> {
	const socket = await acquireSocket();
	if (!socket) return;

	const payload = {
		route,
		contents: { action, value },
		id: uuid.generateNumbID(10),
		needsack,
	};

	const message = JSON.stringify(payload);
	socketlogger.logOutgoing(message);

	// Set a timer to assume disconnection if echo not received
	echoTimers[payload.id] = {
		timeSent: Date.now(),
		timeoutID: window.setTimeout(() => onEchoTimeout(payload.id), socketutil.ECHO_TIMEOUT),
	};

	transmit(socket, message);
	return payload.id;
}

/**
 * Acknowledges a message we received from the server.
 * Echoes are never echoed back, so they skip the id and echo timer {@link send} attaches.
 */
async function sendEcho(id: MessageID): Promise<void> {
	const socket = await acquireSocket();
	if (!socket) return;

	transmit(socket, JSON.stringify({ route: 'echo', contents: id }));
}

/**
 * Readies the socket to take a message, lazily opening one if it isn't up yet.
 * Returns undefined if we couldn't get an open socket, in which case the message is dropped.
 */
async function acquireSocket(): Promise<WebSocket | undefined> {
	if (!(await socketconnection.establishSocket())) return;

	const socket = socketconnection.getSocket();
	if (!socket || socket.readyState !== WebSocket.OPEN) return; // Died while we awaited it.

	socketconnection.resetIdleCloseTimer();
	return socket;
}

/**
 * Puts an already-serialized message on the wire, honoring debug mode's simulated latency.
 * Pure transport — conforming to the server's expected shape is the caller's responsibility.
 */
function transmit(socket: WebSocket, message: string): void {
	if (socketlogger.isDebugEnabled()) {
		window.setTimeout(() => socket.send(message), DEBUG_SOCKET_LATENCY_MS);
	} else socket.send(message); // Send immediately
}

// Exports --------------------------------------------------------------------

export default {
	cancelTimerOfMessageID,
	rescheduleHeartbeatTimer,
	clearPendingState,
	send,
	sendEcho,
};
