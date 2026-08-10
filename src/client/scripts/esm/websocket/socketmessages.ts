// src/client/scripts/esm/websocket/socketmessages.ts

/**
 * Handles outgoing websocket messages and echo tracking.
 *
 * This is the raw transport. User-triggered messages go through socketintents instead,
 * which holds them across a disconnect rather than letting them fall on the floor.
 */

import type { Exact } from '../../../../shared/util/wsutil.js';
import type {
	ServerboundGameMessage,
	ServerboundGeneralMessage,
	ServerboundLobbyMessage,
} from '../../../../shared/serverbound.js';

import uuid from '../../../../shared/util/uuid.js';
import wsutil from '../../../../shared/util/wsutil.js';

import socketman from './socketman.js';
import socketsubs from './socketsubs.js';
import { SocketBus } from './SocketBus.js';

// Types -----------------------------------------------------------------------

type MessageID = number;

/** Every message we may send, keyed by the route it goes out on. */
type OutMessages = {
	general: ServerboundGeneralMessage;
	lobby: ServerboundLobbyMessage;
	game: ServerboundGameMessage;
};

/** A route we may send on. */
type OutRoute = keyof OutMessages;

/** The actions valid on a given route. */
export type OutAction<R extends OutRoute> = OutMessages[R]['action'];

/** The value an action carries, or `undefined` for the actions that carry none. */
export type OutValue<R extends OutRoute, A extends OutAction<R>> =
	Extract<OutMessages[R], { action: A }> extends { value: infer V } ? V : undefined;

// Constants -------------------------------------------------------------------

/** Time the websocket remains open without subscriptions, in milliseconds. */
const cushionBeforeAutoClose = 10000;
/** Simulated websocket latency in debug mode. */
const simulatedWebsocketLatencyMillis_Debug = 1000;
/** Whether to also print incoming echos in debug mode. */
const alsoPrintIncomingEchos = false;

// Variables -------------------------------------------------------------------

/** Echo timers for sent messages awaiting acknowledgement. */
let echoTimers: Record<string, { timeSent: number; timeoutID: number }> = {};

/** The timeout ID that auto-closes the socket when we're not subscribed to anything. */
let timeoutIDToAutoClose: number;

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
 * Closes the current websocket when an echo hasn't been heard.
 * Called a few seconds after not hearing a server echo.
 */
function onEchoTimeout(messageID: MessageID): void {
	if (messageID) {
		delete echoTimers[messageID];
	}
	const socket = socketman.getSocket();
	if (!socket) return;
	console.log(
		`Renewing connection after we haven't received an echo for ${wsutil.ECHO_TIMEOUT} milliseconds...`,
	);
	socket.close(1000, 'Connection closed by client. Renew.');
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

// Timer Management ------------------------------------------------------------

/** If we have zero subscriptions, resets the timer to auto-close the socket. */
function resetTimerToCloseSocket(): void {
	clearTimeout(timeoutIDToAutoClose);
	if (socketsubs.zeroSubs()) {
		timeoutIDToAutoClose = window.setTimeout(
			() => socketman.closeSocket(),
			cushionBeforeAutoClose,
		);
	}
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
		wsutil.HEARTBEAT_INTERVAL_MS + wsutil.ECHO_TIMEOUT,
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

/**
 * Called when no message has been received within the expected time frame.
 * Closes the socket.
 */
function onHeartbeatTimeout(): void {
	heartbeatTimerID = undefined;
	const socket = socketman.getSocket();
	if (!socket) return;
	console.log(
		`No message received for ${wsutil.HEARTBEAT_INTERVAL_MS + wsutil.ECHO_TIMEOUT}ms. Assuming connection lost.`,
	);
	socket.close(1000, 'Connection closed by client. Renew.');
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
 */
async function send<R extends OutRoute, A extends OutAction<R>, V extends OutValue<R, A>>(
	route: R,
	action: A,
	value: Exact<V, OutValue<R, A>>,
): Promise<void> {
	const socket = await acquireSocket();
	if (!socket) return;

	const payload = {
		route,
		contents: { action, value },
		id: uuid.generateNumbID(10),
	};

	const message = JSON.stringify(payload);
	if (socketman.isDebugEnabled()) console.log(`Sending: ${message}`);

	// Set a timer to assume disconnection if echo not received
	echoTimers[payload.id] = {
		timeSent: Date.now(),
		timeoutID: window.setTimeout(() => onEchoTimeout(payload.id), wsutil.ECHO_TIMEOUT),
	};

	transmit(socket, message);
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
	if (!(await socketman.establishSocket())) return;

	const socket = socketman.getSocket();
	if (!socket || socket.readyState !== WebSocket.OPEN) return; // Died while we awaited it.

	resetTimerToCloseSocket();
	return socket;
}

/**
 * Puts an already-serialized message on the wire, honoring debug mode's simulated latency.
 * Pure transport — conforming to the server's expected shape is the caller's responsibility.
 */
function transmit(socket: WebSocket, message: string): void {
	if (socketman.isDebugEnabled()) {
		window.setTimeout(() => socket.send(message), simulatedWebsocketLatencyMillis_Debug);
	} else socket.send(message); // Send immediately
}

// Exports --------------------------------------------------------------------

export default {
	alsoPrintIncomingEchos,
	cancelTimerOfMessageID,
	rescheduleHeartbeatTimer,
	clearPendingState,
	send,
	sendEcho,
};
