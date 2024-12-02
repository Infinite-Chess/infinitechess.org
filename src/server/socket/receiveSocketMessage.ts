
/**
 * This script receives incoming socket messages and routes them where they need to go.
 */


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

import { IncomingMessage } from 'http';
import type { CustomWebSocket } from '../game/wsutility.ts'




/**
 * Callback function that is executed whenever we receive an incoming websocket message.
 * Sends an echo (unless this message itself **is** an echo), rate limits,
 * logs the message, then routes the message where it needs to go.
 */
function onmessage(req: IncomingMessage, ws: CustomWebSocket, rawMessage: any) {
	/** @type {WebsocketMessage} */
	let message;
	try {
		// Parse the stringified JSON message.
		// Incoming message is in binary data, which can also be parsed into JSON
		message = JSON.parse(rawMessage);
		// {
		//     route, // general/invites/game
		//     action, // sub/unsub/createinvite/cancelinvite/acceptinvite
		//     value,
		//     id // ID of the message, for listening for the echo
		// }
	} catch (error) {
		if (!rateLimitWebSocket(req, ws)) return; // Don't miss rate limiting
		logReqWebsocketIn(ws, rawMessage); // Log it anyway before quitting
		const errText = `'Error parsing incoming message as JSON: ${JSON.stringify(error)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
		console.error(errText);
		logEvents(errText, 'hackLog.txt');
		return sendmessage(ws, 'general', 'printerror', `Invalid JSON format!`);
	}

	// Is the parsed message body an object? If not, accessing properties would give us a crash.
	// We have to separately check for null because JAVASCRIPT has a bug where  typeof null => 'object'
	if (typeof message !== 'object' || message === null) return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid websocket message.");

	const isEcho = message.action === "echo";
	if (isEcho) {
		const validEcho = cancelTimerOfMessageID(message); // Cancel timer to assume they've disconnected
		if (!validEcho) {
			if (!rateLimitWebSocket(req, ws)) return; // Don't miss rate limiting
			logReqWebsocketIn(ws, rawMessage); // Log the request anyway.
			const errText = `User detected sending invalid echo! Message: ${JSON.stringify(message)}. Metadata: ${wsutility.stringifySocketMetadata(ws)}`;
			console.error(errText);
			logEvents(errText, 'errLog.txt');
		}
		return;
	}

	// Not an echo...

	// Rate Limit Here
	if (!rateLimitWebSocket(req, ws)) return; // Will have already returned if too many messages.

	// Log the request.
	logReqWebsocketIn(ws, rawMessage);

	if (printIncomingAndOutgoingMessages && !isEcho) console.log("Received message: " + JSON.stringify(message));

	// Send our echo here! We always send an echo to every message except echos themselves.
	if (ws.metadata.sendmessage) ws.metadata.sendmessage(ws, "general", "echo", message.id);

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
			sendmessage(ws, 'general', 'printerror', `Unknown route "${message.route}"!`);
			return;
		}
	}
}



/**
 * Reschedule the timer to send an empty message to the client
 * to verify they are still connected and responding.
 * @param {CustomWebSocket} ws - The socket
 */
function rescheduleRenewConnection(ws) {
	cancelRenewConnectionTimer(ws);
	// Only reset the timer if they are subscribed to a game,
	// or they have an open invite!
	if (!ws.metadata.subscriptions.game && !userHasInvite(ws)) return;

	ws.metadata.renewConnectionTimeoutID = setTimeout(renewConnection, timeOfInactivityToRenewConnection, ws);
}

function cancelRenewConnectionTimer(ws) {
	clearTimeout(ws.metadata.renewConnectionTimeoutID);
	ws.metadata.renewConnectionTimeoutID = undefined;
}

/**
 * 
 * @param {CustomWebSocket} ws - The socket
 */
function renewConnection(ws) {
	sendmessage(ws, 'general', 'renewconnection');
}


// Call when we received the echo from one of our messages.
// This wil cancel the timer that assumes they've disconnected after a few seconds!
function cancelTimerOfMessageID(data) { // { sub, action, value, id }
	const echoMessageID = data.value; // If the action is an "echo", the message ID their echo'ing is stored in "value"!
	const timeoutID = echoTimers[echoMessageID];
	if (timeoutID === undefined) return false; // Timer doesn't exist. Invalid echo messageID!
	clearTimeout(timeoutID);
	delete echoTimers[echoMessageID];
	return true;
}


// Route for this incoming message is "general". What is their action?
function handleGeneralMessage(ws, data) { // data: { route, action, value, id }
	// Listen for new subscriptions or unsubscriptions
	switch (data.action) {
		case "sub":
			handleSubbing(ws, data.value);
			break;
		case "unsub":
			handleUnsubbing(ws, data.value);
			break;
		case 'feature-not-supported':
			handleFeatureNotSupported(ws, data.value);
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `UNKNOWN web socket received action in general route! ${data.action}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			sendmessage(ws, 'general', 'printerror', `Unknown action "${data.action}" in route general.`);
			return;
		}
	}
}

function handleFeatureNotSupported(ws, description) {
	const errText = `Client unsupported feature: ${ensureJSONString(description)}   Socket: ${wsutility.stringifySocketMetadata(ws)}\nBrowser info: ${ws.metadata.userAgent}`;
	logEvents(errText, 'featuresUnsupported.txt', { print: true });
}

function handleSubbing(ws, value) {
	if (!ws.metadata.subscriptions) ws.metadata.subscriptions = {};

	// What are they wanting to subscribe to for updates?
	switch (value) {
		case "invites":
			// Subscribe them to the invites list
			subToInvitesList(ws);
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `Cannot subscribe user to strange new subscription list ${value}! Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			sendmessage(ws, 'general', 'printerror', `Cannot subscribe to "${value}" list!`);
			return;
		}
	}
}

// Set closureNotByChoice to true if you don't immediately want to disconnect them, but say after 5 seconds
function handleUnsubbing(ws, key, subscription, closureNotByChoice) { // subscription: game: { id, color }
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case "invites":
			// Unsubscribe them from the invites list
			unsubFromInvitesList(ws, closureNotByChoice);
			break;
		case "game":
			// If the unsub is not by choice (network interruption instead of closing tab), then we give them
			// a 5 second cushion before starting an auto-resignation timer
			unsubClientFromGameBySocket(ws, { unsubNotByChoice: closureNotByChoice });
			break;
		default: { // Surround this case in a block so that it's variables are not hoisted
			const errText = `Cannot unsubscribe user from strange old subscription list ${key}! Socket: ${wsutility.stringifySocketMetadata(ws)}`;
			logEvents(errText, 'hackLog.txt', { print: true });
			return sendmessage(ws, 'general', 'printerror', `Cannot unsubscribe from "${key}" list!`);
		}
	}
}

// Set closureNotByChoice to true if you don't immediately want to disconnect them, but say after 5 seconds
function unsubClientFromAllSubs(ws, closureNotByChoice) {
	if (!ws.metadata.subscriptions) return; // No subscriptions

	const subscriptions = ws.metadata.subscriptions;
	const subscriptionsKeys = Object.keys(subscriptions);
	for (const key of subscriptionsKeys) {
		const thisSubscription = subscriptions[key]; // invites/game
		handleUnsubbing(ws, key, thisSubscription, closureNotByChoice);
	}
}

export {
	onmessage,
}