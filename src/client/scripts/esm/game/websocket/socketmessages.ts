// src/client/scripts/esm/game/websocket/socketmessages.ts

/**
 * Handles outgoing websocket messages and on-reply functions.
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

/** Time the websocket remains open without subscriptions. */
const cushionBeforeAutoCloseMillis = 10000;
/** Simulated websocket latency in debug mode. */
const simulatedWebsocketLatencyMillis_Debug = 1000;

// Variables -------------------------------------------------------------------

/** Functions to execute when we get a specific reply back. */
let onreplyFuncs: { [key: MessageID]: Function } = {};

/** The timeout ID that auto-closes the socket when we're not subscribed to anything. */
let timeoutIDToAutoClose: number;

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
function executeOnreplyFunc(id: number | undefined): void {
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

	// Attach an ID to every message so the server can include it in the replyto field of responses.
	const payload: OutgoingPayload = {
		route,
		contents: {
			action,
			value,
		},
		id: uuid.generateNumbID(10),
	};

	if (socketman.isDebugEnabled()) console.log(`Sending: ${JSON.stringify(payload)}`);

	scheduleOnreplyFunc(payload.id!, onreplyFunc);

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
	executeOnreplyFunc,
	resetOnreplyFuncs,
};
