
/**
 * This script receives routes incoming socket messages them where they need to go.
 * 
 * It also handles subbing to subscription lists.
 */

import { sendSocketMessage } from './sendSocketMessage.js';
import { handleUnsubbing } from './socketManager.js';
import wsutility from './socketUtility.js';
// @ts-ignore
import { handleGameRoute } from '../game/gamemanager/gamerouter.js';
// @ts-ignore
import { handleInviteRoute } from '../game/invitesmanager/invitesrouter.js';
// @ts-ignore
import { logEvents } from '../middleware/logEvents.js';
// @ts-ignore
import { subToInvitesList } from '../game/invitesmanager/invitesmanager.js';
// @ts-ignore
import { ensureJSONString } from '../utility/JSONUtils.js';


// Type Definitions ---------------------------------------------------------------------------


import type { CustomWebSocket } from './socketUtility.js';

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


function routeIncomingSocketMessage(ws: CustomWebSocket, message: WebsocketInMessage, rawMessage: string) {
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
	routeIncomingSocketMessage,
};

export type { WebsocketInMessage };