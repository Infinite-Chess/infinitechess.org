
/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * cancels their echo timer, sends an echo, then sends the message to our router.
 */


import { deleteEchoTimerForMessageID } from './echoTracker.js';
import { rescheduleRenewConnection, sendSocketMessage } from './sendSocketMessage.js';
import { routeIncomingSocketMessage } from './socketRouter.js';
import socketUtility from './socketUtility.js';
// @ts-ignore
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
// @ts-ignore
import { logEvents, logReqWebsocketIn } from '../middleware/logEvents.js';
// @ts-ignore
import { printIncomingAndOutgoingMessages } from '../config/config.js';


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from './socketUtility.js';
import type { IncomingMessage } from 'http';
import type { WebsocketInMessage } from './socketRouter.js';


// Functions ---------------------------------------------------------------------------


/**
 * Callback function that is executed whenever we receive an incoming websocket message.
 * Sends an echo (unless this message itself **is** an echo), rate limits,
 * logs the message, then routes the message where it needs to go.
 */
function onmessage(req: IncomingMessage, ws: CustomWebSocket, rawMessage: any) {
	let message: WebsocketInMessage;
	try {
		// Parse the stringified JSON message.
		// Incoming message is in binary data, which can also be parsed into JSON
		message = JSON.parse(rawMessage);
	} catch (error) {
		if (!rateLimitAndLogMessage(req, ws, rawMessage)) return; // The socket will have already been closed.
		const errText = `'Error parsing incoming message as JSON: ${JSON.stringify(error)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Invalid JSON format!`);
		return;
	}

	// Validate that the parsed object matches the expected structure
	if (!isValidWebsocketInMessage(message)) {
		sendSocketMessage(ws, "general", "printerror", "Invalid websocket message structure.");
		return;
	}

	// Valid...

	const isEcho = message.action === "echo";
	if (isEcho) {
		const validEcho = deleteEchoTimerForMessageID(message.value); // Cancel timer to assume they've disconnected
		if (!validEcho) {
			if (!rateLimitAndLogMessage(req, ws, rawMessage)) return; // The socket will have already been closed.
			const errText = `User detected sending invalid echo! Message: "${JSON.stringify(message)}". Metadata: ${socketUtility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'errLog.txt', { print: true });
		}
		return;
	}

	// Not an echo...

	if (!rateLimitAndLogMessage(req, ws, rawMessage)) return; // The socket will have already been closed.

	// Send our echo here! We always send an echo to every message except echos themselves.
	sendSocketMessage(ws, "general", "echo", message.id);

	if (printIncomingAndOutgoingMessages && !isEcho) console.log("Received message: " + rawMessage);

	rescheduleRenewConnection(ws); // We know they are connected, so reset this

	routeIncomingSocketMessage(ws, message, rawMessage);
}

/**
 * Logs and rate limits on incoming socket message.
 * Returns true if the message is allowed, or false if the message
 * is being rate limited and the socket has already been closed.
 */
function rateLimitAndLogMessage(req: IncomingMessage, ws: CustomWebSocket, rawMessage: string): boolean {
	if (!rateLimitWebSocket(req, ws)) return false; // They are being rate limited, the socket will have already been closed.
	logReqWebsocketIn(ws, rawMessage); // Only logged the message if it wasn't rate limited.
	return true;
}

/**
 * Type guard to validate if an object is a WebsocketInMessage.
 */
function isValidWebsocketInMessage(parsedIncomingMessage: WebsocketInMessage): boolean {
	return (
		typeof parsedIncomingMessage === 'object' &&
		parsedIncomingMessage !== null &&
		typeof parsedIncomingMessage.route === 'string' &&
		typeof parsedIncomingMessage.action === 'string' &&
		// Allow `value` to be any type, no validation needed for it.
		(parsedIncomingMessage.id === undefined || typeof parsedIncomingMessage.id === 'number')
	);
}



export {
	onmessage,
};