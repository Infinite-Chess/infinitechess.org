// src/server/socket/sendSocketMessage.ts

/**
 * This script sends socket messages,
 * and regularly sends native WebSocket pings to confirm the socket is still connected and responding.
 */

import type { TranslationKeys } from '../../types/translations.js';

import { WebSocket } from 'ws';

import jsutil from '../../shared/util/jsutil.js';
import wsutil from '../../shared/util/wsutil.js';

import socketUtility from './socketUtility.js';
import { getTranslation } from '../utility/translate.js';
import { logEventsAndPrint, logReqWebsocketOut } from '../middleware/logEvents.js';

// Types --------------------------------------------------------------------------------------

/** Represents an outgoing WebSocket server message. */
interface WebsocketOutMessage {
	/** The route to forward the message to (e.g., "general", "invites", "game").
	 * Undefined if it's a reply-only message. */
	route?: string;
	/** The message contents. For other messages, this is an object with action and value.
	 * Absent for reply-only acknowledgement messages (route and action are both undefined). */
	contents?: any;
	/** Optionally, we can include the id of the incoming message that this outgoing message is the reply to. */
	replyto?: number;
}

import type { CustomWebSocket } from './socketUtility.js';

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

/** How long after sending a ping to wait for a pong before assuming disconnection, in milliseconds. */
const timeToWaitForPongMillis = 5000;

// Sending Messages ---------------------------------------------------------------------------

/**
 * Sends a message to this websocket's client.
 * @param ws - The websocket
 * @param route - What subscription/route this message should be forwarded to.
 * @param action - What type of action the client should take within the subscription route.
 * @param value - The contents of the message.
 * @param [replyto] If applicable, the id of the socket message this message is a reply to.
 * @param [options] - Additional options for sending the message.
 * @param [options.skipLatency=false] - If true, we send the message immediately, without waiting for simulated latency again.
 */
function sendSocketMessage(
	ws: CustomWebSocket,
	route: string | undefined,
	action: string | undefined,
	value?: any,
	replyto?: number,
	{ skipLatency }: { skipLatency?: boolean } = {},
): void {
	// socket, invites, createinvite, inviteinfo, messageIDReplyingTo
	// If we're applying simulated latency delay, set a timer to send this message.
	if (simulatedWebsocketLatencyMillis !== 0 && !skipLatency) {
		setTimeout(() => {
			sendSocketMessage(ws, route, action, value, replyto, { skipLatency: true });
		}, simulatedWebsocketLatencyMillis);
		return;
	}

	if (ws.readyState === WebSocket.CLOSED) {
		const errText = `Websocket is in a CLOSED state, can't send message. Action: ${action}. Value: ${jsutil.ensureJSONString(value)}\nSocket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errText, 'errLog.txt');
		return;
	}

	// Reply-only messages should have no empty "contents" field
	const isReplyOnly = route === undefined;
	const payload: WebsocketOutMessage = isReplyOnly
		? {
				replyto,
			}
		: {
				route,
				contents: {
					action,
					value,
				},
				replyto,
			};
	const stringifiedPayload = JSON.stringify(payload);

	// if (!isEcho) console.log(`Sending: ${stringifiedPayload}`);

	ws.send(stringifiedPayload); // Send the message
	logReqWebsocketOut(ws, stringifiedPayload); // Log the sent message

	rescheduleRenewConnection(ws);
}

/**
 * Sends a notification message to the client through the WebSocket connection, to be displayed on-screen.
 * @param ws - The WebSocket connection object.
 * @param translationCode - The code corresponding to the message that needs to be retrieved for language-specific translation. For example, `"server.javascript.ws-already_in_game"`.
 * @param [options] - An object containing additional options.
 * @param [options.replyto] - The ID of the incoming WebSocket message to which this message is replying.
 * @param [options.customNumber] - A number to include with special messages if applicable, typically representing a duration in minutes.
 */
function sendNotify(
	ws: CustomWebSocket,
	translationCode: TranslationKeys,
	{ replyto, customNumber }: { replyto?: number; customNumber?: number } = {},
): void {
	const i18next = ws.metadata.cookies.i18next;
	let text = getTranslation(translationCode, i18next);
	// Special case: number of minutes to be displayed upon server restart
	if (
		translationCode === 'server.javascript.ws-server_restarting' &&
		customNumber !== undefined
	) {
		const minutes = Number(customNumber); // Cast to number in case it's a string
		const minutes_plurality =
			minutes === 1
				? getTranslation('server.javascript.ws-minute', i18next)
				: getTranslation('server.javascript.ws-minutes', i18next);
		text += ` ${minutes} ${minutes_plurality}.`;
	}
	sendSocketMessage(ws, 'general', 'notify', text, replyto);
}

/**
 * Sends a message to the client through the websocket, to be displayed on-screen as an ERROR.
 * @param ws - The socket
 * @param translationCode - The code of the message to retrieve the language-specific translation for. For example, `"server.javascript.ws-already_in_game"`
 */
function sendNotifyError(ws: CustomWebSocket, translationCode: TranslationKeys): void {
	sendSocketMessage(
		ws,
		'general',
		'notifyerror',
		getTranslation(translationCode, ws.metadata.cookies.i18next),
	);
}

// Renewing Connection if we haven't sent a message in a while ----------------------------------------------------------

/**
 * Reschedule the timer to send a native WebSocket ping to the client
 * to verify they are still connected and responding.
 */
function rescheduleRenewConnection(ws: CustomWebSocket): void {
	cancelRenewConnectionTimer(ws);
	// Only reset the timer if they have at least one subscription!
	if (Object.keys(ws.metadata.subscriptions).length === 0) return; // No subscriptions

	ws.metadata.renewConnectionTimeoutID = setTimeout(
		() => renewConnection(ws),
		wsutil.timeOfInactivityToRenewConnection,
	);
}

function cancelRenewConnectionTimer(ws: CustomWebSocket): void {
	clearTimeout(ws.metadata.renewConnectionTimeoutID);
	ws.metadata.renewConnectionTimeoutID = undefined;
}

/**
 * Sends a native WebSocket ping to the client to verify they are still connected.
 * If no pong is received within the timeout, the socket is closed.
 */
function renewConnection(ws: CustomWebSocket): void {
	ws.metadata.pingTimestamp = Date.now();
	ws.ping();
	// If no pong arrives within the timeout, assume disconnected and close the socket.
	ws.metadata.renewConnectionTimeoutID = setTimeout(() => {
		ws.metadata.renewConnectionTimeoutID = undefined;
		ws.close(1014, 'No pong heard');
	}, timeToWaitForPongMillis);
}

export {
	sendSocketMessage,
	sendNotify,
	sendNotifyError,
	rescheduleRenewConnection,
	cancelRenewConnectionTimer,
	renewConnection,
};
