// src/client/scripts/esm/game/websocket/socketmessages.ts

/**
 * Handles outgoing websocket messages, echo tracking, and on-reply functions.
 */

import uuid from '../../../../../shared/util/uuid.js';

import toast from '../gui/toast.js';
import socketman from './socketman.js';
import socketsubs from './socketsubs.js';

// Types -----------------------------------------------------------------------

type MessageID = number;

type WebsocketMessageValue = MessageEvent['data'];

/** The shape of an outgoing websocket payload sent to the server. */
type OutgoingPayload = {
	route: string;
	contents: {
		action: string;
		value: WebsocketMessageValue;
	};
	id?: number;
};

// Constants -------------------------------------------------------------------

/** Time to wait for echo before assuming disconnection. */
const timeToWaitForEchoMillis = 5000;
/**
 * Time after the server's last sent message before the server sends a
 * 'renewconnection' keepalive. Mirrors the server-side constant.
 */
const timeOfInactivityToRenewConnection = 10000;
/** Time the websocket remains open without subscriptions. */
const cushionBeforeAutoCloseMillis = 10000;
/** Simulated websocket latency in debug mode. */
const simulatedWebsocketLatencyMillis_Debug = 1000;
/** Whether to also print incoming echos in debug mode. */
const alsoPrintIncomingEchos = false;

// Variables -------------------------------------------------------------------

/** Echo timers for sent messages awaiting acknowledgement. */
let echoTimers: Record<string, { timeSent: number; timeoutID: number }> = {};

/** Functions to execute when we get a specific reply back. */
let onreplyFuncs: { [key: MessageID]: Function } = {};

/** A list of setTimeout timer IDs to cancel whenever a new socket is established. */
const timerIDsToCancelOnNewSocket: number[] = [];

/** The timeout ID that auto-closes the socket when we're not subscribed to anything. */
let timeoutIDToAutoClose: number;

/**
 * The timeout ID for detecting server inactivity.
 * If no message is received within the expected window, the client
 * assumes the connection is dead and closes the socket.
 */
let inactivityTimerID: number | undefined;

// Echo Tracking ---------------------------------------------------------------

/**
 * Called when we hear a server echo. Cancels the timer that assumes
 * disconnection, and updates the ping display.
 */
function cancelTimerOfMessageID(message: { value: WebsocketMessageValue }): void {
	const echoMessageID = message.value; // If the action is an "echo", the message ID their echo'ing is stored in "value"!

	const echoTimer = echoTimers[echoMessageID];
	if (!echoTimer) {
		console.error('Could not find echo timer for message.');
		return;
	}

	// Update the Ping meter with the round-trip time
	const timeTaken = Date.now() - echoTimer.timeSent;
	document.dispatchEvent(new CustomEvent('ping', { detail: timeTaken }));

	clearTimeout(echoTimer.timeoutID);
	delete echoTimers[echoMessageID];
}

/**
 * Closes the current websocket when an echo hasn't been heard.
 * Called a few seconds after not hearing a server echo.
 */
function renewConnection(messageID: MessageID): void {
	if (messageID) {
		delete echoTimers[messageID];
	}
	const socket = socketman.getSocket();
	if (!socket) return;
	console.log(
		`Renewing connection after we haven't received an echo for ${timeToWaitForEchoMillis} milliseconds...`,
	);
	socketman.dispatchLostConnectionCustomEvent();
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

// On-Reply Functions ----------------------------------------------------------

/**
 * Flags an outgoing message to execute a function when the server replies.
 * @param messageID - The ID of the outgoing message
 * @param onreplyFunc - The function to execute on reply
 */
function scheduleOnreplyFunc(messageID: MessageID, onreplyFunc?: () => void): void {
	if (!onreplyFunc) return;
	onreplyFuncs[messageID] = onreplyFunc;
}

/**
 * When we receive a message with the `replyto` property,
 * executes the on-reply function for that sent message.
 */
function executeOnreplyFunc(id: number): void {
	if (id === undefined) return;
	if (!onreplyFuncs[id]) return;
	onreplyFuncs[id]();
	delete onreplyFuncs[id];
}

/** Erases all on-reply functions. Called when the socket is terminated. */
function resetOnreplyFuncs(): void {
	onreplyFuncs = {};
}

// Timer Management ------------------------------------------------------------

/** Cancels all timers that should be canceled on new socket establishment. */
function cancelAllTimerIDsToCancelOnNewSocket(): void {
	timerIDsToCancelOnNewSocket.forEach((ID) => clearTimeout(ID));
}

/** Adds a timer ID to cancel upon the next socket establishment. */
function addTimerIDToCancelOnNewSocket(ID: number): void {
	timerIDsToCancelOnNewSocket.push(ID);
}

/** If we have zero subscriptions, resets the timer to auto-close the socket. */
function resetTimerToCloseSocket(): void {
	clearTimeout(timeoutIDToAutoClose);
	if (socketsubs.zeroSubs()) {
		timeoutIDToAutoClose = window.setTimeout(
			() => socketman.closeSocket(),
			cushionBeforeAutoCloseMillis,
		);
	}
}

// Inactivity Detection --------------------------------------------------------

/**
 * Reschedules the inactivity timer. Called on every incoming message.
 * If no message is received within timeOfInactivityToRenewConnection + timeToWaitForEchoMillis,
 * the client assumes the connection is dead and closes the socket.
 *
 * Rationale: The server sends 'renewconnection' after timeOfInactivityToRenewConnection of
 * no sent messages. If we don't hear ANY message within that window plus the echo timeout,
 * the connection has silently failed.
 */
function rescheduleInactivityTimer(): void {
	cancelInactivityTimer();
	if (socketsubs.zeroSubs()) return;
	inactivityTimerID = window.setTimeout(
		onInactivityTimeout,
		timeOfInactivityToRenewConnection + timeToWaitForEchoMillis,
	);
}

/** Cancels the inactivity timer. Called when the socket closes. */
function cancelInactivityTimer(): void {
	if (inactivityTimerID !== undefined) {
		clearTimeout(inactivityTimerID);
		inactivityTimerID = undefined;
	}
}

/**
 * Called when no message has been received within the expected window.
 * Closes the socket and dispatches a lost connection event.
 */
function onInactivityTimeout(): void {
	inactivityTimerID = undefined;
	const socket = socketman.getSocket();
	if (!socket) return;
	console.log(
		`No message received for ${timeOfInactivityToRenewConnection + timeToWaitForEchoMillis}ms. Assuming connection lost.`,
	);
	socketman.dispatchLostConnectionCustomEvent();
	socket.close(1000, 'Connection closed by client. Renew.');
}

// Sending Messages ------------------------------------------------------------

/**
 * Sends a message to the server with the provided route, action, and values.
 * @param route - Where the server needs to forward this to. general/invites/game
 * @param action - What action to take within the route.
 * @param value - The contents of the message
 * @param isUserAction - Whether this message is a direct result of a user action. Default: false
 * @param onreplyFunc - Optional function to execute when we receive the server's response.
 * @returns *true* if the message was able to send.
 */
async function send(
	route: string,
	action: string,
	value?: WebsocketMessageValue,
	isUserAction?: boolean,
	onreplyFunc?: () => void,
): Promise<boolean> {
	if (!(await socketman.establishSocket())) {
		if (isUserAction) toast.show(translations.websocket.too_many_requests);
		if (onreplyFunc) onreplyFunc();
		return false;
	}

	resetTimerToCloseSocket();

	let payload: OutgoingPayload;
	if (action === 'echo') {
		payload = {
			route: 'echo',
			contents: value,
		};
	} else {
		// Not an echo, attach an ID and expect an echo back.
		payload = {
			route,
			contents: {
				action,
				value,
			},
			id: uuid.generateNumbID(10),
		};

		if (socketman.isDebugEnabled()) console.log(`Sending: ${JSON.stringify(payload)}`);

		// Set a timer to assume disconnection if echo not received
		echoTimers[payload.id!] = {
			timeSent: Date.now(),
			timeoutID: window.setTimeout(
				() => renewConnection(payload.id!),
				timeToWaitForEchoMillis,
			),
		};

		scheduleOnreplyFunc(payload.id!, onreplyFunc);
	}

	const socket = socketman.getSocket();
	if (!socket || socket.readyState !== WebSocket.OPEN) return false; // Closed state, can't send message.

	const stringifiedMessage = JSON.stringify(payload);

	if (socketman.isDebugEnabled()) {
		window.setTimeout(
			() => socket.send(stringifiedMessage),
			simulatedWebsocketLatencyMillis_Debug,
		);
	} else socket.send(stringifiedMessage); // Send immediately

	return true;
}

// Exports --------------------------------------------------------------------

export default {
	send,
	cancelTimerOfMessageID,
	cancelAllEchoTimers,
	executeOnreplyFunc,
	resetOnreplyFuncs,
	cancelAllTimerIDsToCancelOnNewSocket,
	addTimerIDToCancelOnNewSocket,
	resetTimerToCloseSocket,
	rescheduleInactivityTimer,
	cancelInactivityTimer,
	alsoPrintIncomingEchos,
};
