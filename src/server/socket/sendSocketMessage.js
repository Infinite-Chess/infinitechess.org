
/**
 * This script sends socket messages
 */


/**
 * Type Definitions
 * @typedef {import('../game/TypeDefinitions.js').Socket} Socket
 * @typedef {import('../game/TypeDefinitions.js').WebsocketMessage} WebsocketMessage
 */


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


/**
 * Sends a message to this websocket's client.
 * @param {Object} ws - The websocket
 * @param {string} sub - What subscription/route this message should be forwarded to.
 * @param {string} action - What type of action the client should take within the subscription route.
 * @param {*} value - The contents of the message.
 * @param {number} [replyto] If applicable, the id of the socket message this message is a reply to.
 * @param {Object} [options] - Additional options for sending the message.
 * @param {boolean} [options.skipLatency=false] - If true, we send the message immediately, without waiting for simulated latency again.
 */
function sendmessage(ws, sub, action, value, replyto, { skipLatency } = {}) { // socket, invites, createinvite, inviteinfo, messageIDReplyingTo
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
 * Tell them to hard-refresh the page, there's a new update.
 * @param {Socket} ws - The websocket
 */
function informSocketToHardRefresh(ws) {
	console.log(`Informing socket to hard refresh! ${wsutility.stringifySocketMetadata(ws)}`);
	sendmessage(ws, 'general', 'hardrefresh', GAME_VERSION);
}