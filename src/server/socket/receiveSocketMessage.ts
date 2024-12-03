
/**
 * This script receives incoming socket messages and routes them where they need to go.
 */


import { IncomingMessage } from 'http';
// @ts-ignore
import type { CustomWebSocket } from './socketUtility.js';
// @ts-ignore
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
// @ts-ignore
import { logEvents, logReqWebsocketIn } from '../middleware/logEvents.js';
// @ts-ignore
import wsutility from './socketUtility.js';
// @ts-ignore
import { sendSocketMessage } from './sendSocketMessage.js';
// @ts-ignore
import { printIncomingAndOutgoingMessages } from '../config/config.js';
// @ts-ignore
import { handleInviteRoute } from '../game/invitesmanager/invitesrouter.js';
// @ts-ignore
import { handleGameRoute } from '../game/gamemanager/gamerouter.js';
// @ts-ignore
import { handleUnsubbing } from './socketManager.js';
// @ts-ignore
import { deleteEchoTimerForMessageID } from './echoTracker.js';
// @ts-ignore
import { subToInvitesList } from '../game/invitesmanager/invitesmanager.js';
// @ts-ignore
import { ensureJSONString } from '../utility/JSONUtils.js';


// Type Definitions ---------------------------------------------------------------------------


/**
 * Represents an incoming WebSocket server message.
 */
interface WebsocketInMessage {
	/** The route to forward the message to (e.g., "general", "invites", "game"). */
	route: string;
	/** The action to perform with the message's data (e.g., "sub", "unsub", "createinvite"). */
	action: string;
	/** The contents of the message. */
	value: any;
	/** The ID of the message to echo, indicating the connection is still active.
	 * Or undefined if this message itself is an echo. */
	id?: number;
}


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
		const errText = `'Error parsing incoming message as JSON: ${JSON.stringify(error)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
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
			const errText = `User detected sending invalid echo! Message: "${JSON.stringify(message)}". Metadata: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'errLog.txt', { print: true });
		}
		return;
	}

	// Not an echo...

	if (!rateLimitAndLogMessage(req, ws, rawMessage)) return; // The socket will have already been closed.

	if (printIncomingAndOutgoingMessages && !isEcho) console.log("Received message: " + rawMessage);

	// Send our echo here! We always send an echo to every message except echos themselves.
	sendSocketMessage(ws, "general", "echo", message.id);

	routeIncomingMessage(ws, message, rawMessage);
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

function routeIncomingMessage(ws: CustomWebSocket, message: WebsocketInMessage, rawMessage: string) {
	// Route them to their specified location
	switch (message.route) {
		case "general":
			handleGeneralMessage(ws, message); // { route, action, value, id }
			break;
		case "invites":
			// Forward them to invites subscription to handle their action!
			handleInviteRoute(ws, message); // { route, action, value, id }
			break;
		case "game":
			// Forward them to our games module to handle their action
			handleGameRoute(ws, message);
			break;
		default: { // Surround this case in a block so it's variables are not hoisted
			const errText = `UNKNOWN web socket received route "${message.route}"! Message: ${rawMessage}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			sendSocketMessage(ws, 'general', 'printerror', `Unknown route "${message.route}"!`);
			return;
		}
	}
}

// Route for this incoming message is "general". What is their action?
function handleGeneralMessage(ws: CustomWebSocket, message: WebsocketInMessage) { // data: { route, action, value, id }
	// Listen for new subscriptions or unsubscriptions
	switch (message.action) {
		case "sub":
			handleSubbing(ws, message.value);
			break;
		case "unsub":
			handleUnsubbing(ws, message.value);
			break;
		case 'feature-not-supported':
			handleFeatureNotSupported(ws, message.value);
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `UNKNOWN web socket received action in general route! "${message.action}". Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			sendSocketMessage(ws, 'general', 'printerror', `Unknown action "${message.action}" in route general.`);
		}
	}
}

function handleSubbing(ws: CustomWebSocket, value: any) {
	if (typeof value !== 'string') {
		const errText = `Websocket received sub is invalid! "${value}". Socket: ${wsutility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'hackLog.txt', { print: true });
		sendSocketMessage(ws, 'general', 'printerror', `Websocket received sub is invalid.`);
	}

	// What are they wanting to subscribe to for updates?
	switch (value) {
		case "invites":
			// Subscribe them to the invites list
			subToInvitesList(ws);
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `Cannot subscribe user to strange new subscription list ${value}! Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			sendSocketMessage(ws, 'general', 'printerror', `Cannot subscribe to "${value}" list!`);
			return;
		}
	}
}

function handleFeatureNotSupported(ws: CustomWebSocket, description: any) {
	const errText = `Client unsupported feature: ${ensureJSONString(description)}   Socket: ${wsutility.stringifySocketMetadata(ws)}\nBrowser info: ${ws.metadata.userAgent}`;
	logEvents(errText, 'featuresUnsupported.txt', { print: true });
}



export {
	onmessage,
};

export type { WebsocketInMessage };