
/**
 * This script sends socket messages,
 * and regularly sends messages by itself to confirm the socket is still connected and responding.
 */

import { WebSocket } from "ws";

// @ts-ignore
import uuid from "../../client/scripts/esm/util/uuid.js";
// @ts-ignore
import { GAME_VERSION, printIncomingAndOutgoingMessages, simulatedWebsocketLatencyMillis } from "../config/config.js";
// @ts-ignore
import { logEvents, logReqWebsocketOut } from "../middleware/logEvents.js";
// @ts-ignore
import { ensureJSONString } from "../utility/JSONUtils.js";
// @ts-ignore
import { getTranslation } from "../utility/translate.js";
// @ts-ignore
import { addTimeoutToEchoTimers, timeToWaitForEchoMillis } from "./echoTracker.js";
import wsutility from "./socketUtility.js";


// Type Definitions ---------------------------------------------------------------------------


/**
 * Represents an incoming WebSocket server message.
 */
interface WebsocketOutMessage {
	/** The subscription to forward the message to (e.g., "general", "invites", "game"). */
	sub: string;
	/** The action to perform with the message's data (e.g., "sub", "unsub", "joingame", "opponentmove"). */
	action: string;
	/** The contents of the message. */
	value: any;
	/** The ID of the message to echo, indicating the connection is still active.
	 * Or undefined if this message itself is an echo. */
	id?: number;
	/** Optionally, we can include the id of the incoming message that this outgoing message is the reply to. */
	replyto?: number;
}

import type { CustomWebSocket } from "./socketUtility.js";


// Variables ---------------------------------------------------------------------------


/** After this much time of no messages sent we send a message,
 * expecting an echo, just to check if they are still connected. */
const timeOfInactivityToRenewConnection = 10000;


// Functions ---------------------------------------------------------------------------


/**
 * Sends a message to this websocket's client.
 * @param ws - The websocket
 * @param sub - What subscription/route this message should be forwarded to.
 * @param action - What type of action the client should take within the subscription route.
 * @param value - The contents of the message.
 * @param [replyto] If applicable, the id of the socket message this message is a reply to.
 * @param [options] - Additional options for sending the message.
 * @param [options.skipLatency=false] - If true, we send the message immediately, without waiting for simulated latency again.
 */
function sendSocketMessage(ws: CustomWebSocket, sub: string, action: string, value?: any, replyto?: number, { skipLatency }: { skipLatency?: boolean } = {}) { // socket, invites, createinvite, inviteinfo, messageIDReplyingTo
	// If we're applying simulated latency delay, set a timer to send this message.
	if (simulatedWebsocketLatencyMillis !== 0 && !skipLatency) {
		setTimeout(sendSocketMessage, simulatedWebsocketLatencyMillis, ws, sub, action, value, replyto, { skipLatency: true });
		return;
	}

	if (ws.readyState === WebSocket.CLOSED) {
		const errText = `Websocket is in a CLOSED state, can't send message. Action: ${action}. Value: ${ensureJSONString(value)}\nSocket: ${wsutility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'errLog.txt', { print: true });
		return;
	}
    
	const isEcho = action === "echo";
	const payload: WebsocketOutMessage = {
		sub, // general/error/invites/game
		action, // sub/unsub/createinvite/cancelinvite/acceptinvite
		value, // sublist/inviteslist/move
		id: isEcho ? undefined : uuid.generateNumbID(10), // Only include an id (and accept an echo back) if this is NOT an echo itself!
		replyto,
	};
	const stringifiedPayload = JSON.stringify(payload);

	if (printIncomingAndOutgoingMessages && !isEcho) console.log(`Sending: ${stringifiedPayload}`);

	ws.send(stringifiedPayload); // Send the message
	if (!isEcho) { // Not an echo
		logReqWebsocketOut(ws, stringifiedPayload); // Log the sent message

		// Set a timer. At the end, just assume we've disconnected and start again.
		// This will be canceled if we here the echo in time.
		const timeout = setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED) ws.close(1014, "No echo heard"); }, timeToWaitForEchoMillis);
		//console.log(`Set timer of message id "${id}"`)
		addTimeoutToEchoTimers(payload.id!, timeout);

		rescheduleRenewConnection(ws);
	}
}

/**
 * Sends a notification message to the client through the WebSocket connection, to be displayed on-screen.
 * @param ws - The WebSocket connection object.
 * @param translationCode - The code corresponding to the message that needs to be retrieved for language-specific translation. For example, `"server.javascript.ws-already_in_game"`.
 * @param [options] - An object containing additional options.
 * @param [options.replyto] - The ID of the incoming WebSocket message to which this message is replying.
 * @param [options.customNumber] - A number to include with special messages if applicable, typically representing a duration in minutes.
 */
function sendNotify(ws: CustomWebSocket, translationCode: string, { replyto, customNumber }: { replyto?: number, customNumber?: number } = {}) {
	const i18next = ws.metadata.cookies.i18next;
	let text = getTranslation(translationCode, i18next);
	// Special case: number of minutes to be displayed upon server restart
	if (translationCode === "server.javascript.ws-server_restarting" && customNumber !== undefined) {
		const minutes = Number(customNumber); // Cast to number in case it's a string
		const minutes_plurality = minutes === 1 ? getTranslation("server.javascript.ws-minute", i18next) : getTranslation("server.javascript.ws-minutes", i18next);
		text += ` ${minutes} ${minutes_plurality}.`;
	}
	sendSocketMessage(ws, "general", "notify", text, replyto);
}

/**
 * Sends a message to the client through the websocket, to be displayed on-screen as an ERROR.
 * @param ws - The socket
 * @param translationCode - The code of the message to retrieve the language-specific translation for. For example, `"server.javascript.ws-already_in_game"`
 */
function sendNotifyError(ws: CustomWebSocket, translationCode: string) {
	sendSocketMessage(ws, "general", "notifyerror", getTranslation(translationCode, ws.metadata.cookies.i18next));
}


/**
 * Tell them to hard-refresh the page, there's a new update.
 */
function informSocketToHardRefresh(ws: CustomWebSocket) {
	console.log(`Informing socket to hard refresh! ${wsutility.stringifySocketMetadata(ws)}`);
	sendSocketMessage(ws, 'general', 'hardrefresh', GAME_VERSION);
}


// Renewing Connection if we haven't sent a message in a while ----------------------------------------------------------


/**
 * Reschedule the timer to send an empty message to the client
 * to verify they are still connected and responding.
 */
function rescheduleRenewConnection(ws: CustomWebSocket) {
	cancelRenewConnectionTimer(ws);
	// Only reset the timer if they have atleast one subscription!
	if (Object.keys(ws.metadata.subscriptions).length === 0) return; // No subscriptions

	ws.metadata.renewConnectionTimeoutID = setTimeout(renewConnection, timeOfInactivityToRenewConnection, ws);
}

function cancelRenewConnectionTimer(ws: CustomWebSocket) {
	clearTimeout(ws.metadata.renewConnectionTimeoutID);
	ws.metadata.renewConnectionTimeoutID = undefined;
}


/**
 * Send an empty message to the client, expecting an echo
 * within five seconds to make sure they are still connected.
 */
function renewConnection(ws: CustomWebSocket) {
	sendSocketMessage(ws, 'general', 'renewconnection');
}


export {
	sendSocketMessage,
	sendNotify,
	sendNotifyError,
	informSocketToHardRefresh,
	rescheduleRenewConnection,
};