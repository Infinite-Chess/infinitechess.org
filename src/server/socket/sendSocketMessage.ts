
/**
 * This script sends socket messages
 */


// Type Definitions ---------------------------------------------------------------------------


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */

import type { CustomWebSocket } from "../game/wsutility.ts";

// Variables ---------------------------------------------------------------------------


/**
 * The time, after which we don't hear an expected echo from a websocket,
 * in which it be assumed disconnected, and auto terminated, in milliseconds.
*/
const timeToWaitForEchoMillis = 5000; // 5 seconds until we assume we've disconnected!

/**
 * An object containing the timeout ID's for the timers that auto terminate
 * websockets if we never hear an echo back: `{ messageID: timeoutID }`
 */
const echoTimers = {};


// Functions ---------------------------------------------------------------------------


/**
 * Sends a message to this websocket's client.
 * @param ws - The websocket
 * @param {string} sub - What subscription/route this message should be forwarded to.
 * @param {string} action - What type of action the client should take within the subscription route.
 * @param {*} value - The contents of the message.
 * @param {number} [replyto] If applicable, the id of the socket message this message is a reply to.
 * @param {Object} [options] - Additional options for sending the message.
 * @param {boolean} [options.skipLatency=false] - If true, we send the message immediately, without waiting for simulated latency again.
 */
function sendmessage(ws: CustomWebSocket, sub, action, value, replyto, { skipLatency } = {}) { // socket, invites, createinvite, inviteinfo, messageIDReplyingTo
	// If we're applying simulated latency delay, set a timer to send this message.
	if (simulatedWebsocketLatencyMillis !== 0 && !skipLatency) return setTimeout(sendmessage, simulatedWebsocketLatencyMillis, ws, sub, action, value, replyto, { skipLatency: true });

	if (!ws) return console.error(`Cannot send a message to an undefined socket! Sub: ${sub}. Action: ${action}. Value: ${value}`);
	if (ws.readyState === WebSocket.CLOSED) {
		const errText = `Websocket is in a CLOSED state, can't send message. Action: ${action}. Value: ${ensureJSONString(value)}\nSocket: ${wsutility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'errLog.txt', { print: true });
		return;
	}
    
	const payload = {
		sub, // general/error/invites/game
		action, // sub/unsub/createinvite/cancelinvite/acceptinvite
		value // sublist/inviteslist/move
	};
	// Only include an id (and except an echo back) if this is NOT an echo'ing itself!
	const isEcho = action === "echo";
	if (!isEcho) payload.id = generateNumbID(10);
	if (typeof replyto === 'number') payload.replyto = replyto;

	if (printIncomingAndOutgoingMessages && !isEcho) console.log(`Sending: ${JSON.stringify(payload)}`);

	// Set a timer. At the end, just assume we've disconnected and start again.
	// This will be canceled if we here the echo in time.
	if (!isEcho) echoTimers[payload.id] = setTimeout(closeWebSocketConnection, timeToWaitForEchoMillis, ws, 1014, "No echo heard", payload.id); // Code 1014 is Bad Gateway
	//console.log(`Set timer of message id "${id}"`)

	const stringifiedPayload = JSON.stringify(payload);
	ws.send(stringifiedPayload);
	if (!isEcho) logReqWebsocketOut(ws, stringifiedPayload);

	rescheduleRenewConnection(ws);
}

/**
 * Sends a notification message to the client through the WebSocket connection, to be displayed on-screen.
 * @param ws - The WebSocket connection object.
 * @param {string} translationCode - The code corresponding to the message that needs to be retrieved for language-specific translation. For example, `"server.javascript.ws-already_in_game"`.
 * @param {Object} options - An object containing additional options.
 * @param {number} options.replyto - The ID of the incoming WebSocket message to which this message is replying.
 * @param {number} [options.number] - A number to include with special messages if applicable, typically representing a duration in minutes.
 */
function sendNotify(ws: CustomWebSocket, translationCode, { replyto, number } = {}) {
	const i18next = ws.cookies.i18next;
	let text = getTranslation(translationCode, i18next);
	// Special case: number of minutes to be displayed upon server restart
	if (translationCode === "server.javascript.ws-server_restarting" && number !== undefined) {
		const minutes = Number(number); // Cast to number in case it's a string
		const minutes_plurality = minutes === 1 ? getTranslation("server.javascript.ws-minute", i18next) : getTranslation("server.javascript.ws-minutes", i18next);
		text += ` ${minutes} ${minutes_plurality}.`;
	}
	ws.metadata.sendmessage(ws, "general", "notify", text, replyto);
}

/**
 * Sends a message to the client through the websocket, to be displayed on-screen as an ERROR.
 * @param ws - The socket
 * @param {string} translationCode - The code of the message to retrieve the language-specific translation for. For example, `"server.javascript.ws-already_in_game"`
 */
function sendNotifyError(ws: CustomWebSocket, translationCode) {
	ws.metadata.sendmessage(ws, "general", "notifyerror", getTranslation(translationCode, ws.cookies.i18next));
}


/**
 * Tell them to hard-refresh the page, there's a new update.
 * @param {Socket} ws - The websocket
 */
function informSocketToHardRefresh(ws) {
	console.log(`Informing socket to hard refresh! ${wsutility.stringifySocketMetadata(ws)}`);
	sendmessage(ws, 'general', 'hardrefresh', GAME_VERSION);
}


export default {
	sendmessage,
}