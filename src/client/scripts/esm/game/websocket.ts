// @ts-ignore
import statustext from './gui/statustext.js';
// @ts-ignore
import invites from './misc/invites.js';
import onlinegame from './misc/onlinegame/onlinegame.js';
import localstorage from '../util/localstorage.js';
import timeutil from '../../../../shared/util/timeutil.js';
import uuid from '../../../../shared/util/uuid.js';
import config from './config.js';
import thread from '../util/thread.js';
import validatorama from '../util/validatorama.js';
import wsutil from '../../../../shared/util/wsutil.js';
import onlinegamerouter from './misc/onlinegame/onlinegamerouter.js';
import docutil from '../util/docutil.js';
import { GAME_VERSION } from '../../../../shared/game_version.js';

// Custom type definitions...

type WebsocketMessageValue = MessageEvent['data'];

/** Information about the last hard refresh we attempted. */
type HardRefreshInfo = {
	timeLastHardRefreshed: number;
	expectedVersion: string;
	refreshFailed?: boolean;
};

/**
 * An incoming websocket server message.
 */
interface WebsocketMessage {
	/** What subscription the message should be forwarded to (e.g. "general", "invites", "game"). */
	sub: string;
	/** What action to perform with this message's data. */
	action: string;
	/** The message contents. */
	value: WebsocketMessageValue;
	/** The ID of the message to echo, so the server knows we've received it. */
	id: number;
	/** The ID of the message this message is the reply to, if specified. */
	replyto: number;
}

type MessageID = number;

/**
 * This script creates websockets connected to the server,
 * sends and receives incoming messages.
 */

/** The websocket object we will use to send and receive messages from the server. */
let socket: WebSocket | undefined;
let openingSocket = false; // True if currently repeatedly trying to create a socket, until network is back.
/** The timeout ID of the timer to display we've lost connection
 * (by http) if we don't hear back after 5 seconds of trying to open a socket.
 */
let reqOut: false | number = false; // True if a SINGLE attempt is out to create a socket!
/** True if we are having trouble connecting. If this is true, and we reconnect,
 * then we'll display "Reconnected." */
let noConnection = false;
let inTimeout = false; // true when the server tells us too many requests. Don't reconnect for a bit

/** The time our websocket will remain open for, if we're not subscribed to anything, in milliseconds. */
const cushionBeforeAutoCloseMillis = 10000;
/** The timeout ID that can be used to cancel the timer to auto-close
 * the websocket when we're not subscribed to anything for at least {@link cushionBeforeAutoCloseMillis} */
let timeoutIDToAutoClose: number;

const validSubs = ['invites', 'game'] as const;
const subs = {
	invites: false,
	game: false,
};
const timeToResubAfterNetworkLossMillis = 5000;
const timeToResubAfterTooManyRequestsMillis = 10000;
const timeToResubAfterMessageTooBigMillis = timeToResubAfterNetworkLossMillis;

const timeToWaitForHTTPMillis = 5000; // Milliseconds to assume http isn't connecting
const timeToWaitForEchoMillis = 5000; // 3 seconds until we assume we've disconnected!
let echoTimers: Record<string, { timeSent: number; timeoutID: number }> = {}; // A list of setTimeout id's that are currently out.

// List of functions to execute when we get specified reply back
let onreplyFuncs: { [key: MessageID]: Function } = {}; // { messageID: onreplyFunc }

/** A list of setTimeout timer IDs to cancel whenever a new socket is established. */
const timerIDsToCancelOnNewSocket: number[] = [];

// Debugging...
const alsoPrintIncomingEchos = false;

/** Enables simulated websocket latency, and prints all sent and received messages. */
let DEBUG = false;
/** The amount of milliseconds of delay to add to our sent socket messages in DEBUG mode. */
const simulatedWebsocketLatencyMillis_Debug = 1000; // 1 Second
// const simulatedWebsocketLatencyMillis_Debug = 2000; // 2 Seconds

/**
 * The last time the server closed our socket connection request because
 * we were missing a browser-id cookie, in millis since the Unix Epoch.
 */
let lastTimeWeGotAuthorizationNeededMessage: number | undefined;

(function init() {
	initListeners();
})();

function initListeners(): void {
	document.addEventListener('connection-lost', alertUserLostConnection); // A custom event that is dispatched when we lose websocket connection or its very bad.
}

function toggleDebug(): void {
	if (!docutil.isLocalEnvironment())
		statustext.showStatus("Can't enable websocket latency in production.");
	DEBUG = !DEBUG;
	statustext.showStatus(`Toggled websocket latency: ${DEBUG}`);
}

function alertUserLostConnection(): void {
	noConnection = true;
	statustext.showStatusForDuration(
		translations['websocket'].no_connection,
		timeToWaitForHTTPMillis,
	); // Alert the user
}

/**
 * Repeatedly tries to open a web socket to the server until it is successful,
 * **unless** we are in timeout, then it will refuse.
 * This will never open more than a single socket at a time.
 *
 * This NEVER needs to be called manually, because
 * {@link sendmessage} automatically calls this.
 * @returns *true* if was able to open a socket.
 */
async function establishSocket(): Promise<boolean> {
	// Before we try to establish the socket again, we have to make sure we aren't in timeout from sending too many requests!
	if (inTimeout) return false;

	while (openingSocket || (socket && socket.readyState !== WebSocket.OPEN)) {
		if (config.DEV_BUILD) console.log('Waiting for the socket to be established or closed..');
		await thread.sleep(100); // NEVER open more than 1 socket!
	}
	if (socket && socket.readyState === WebSocket.OPEN) return true;

	openingSocket = true;

	// No socket open yet, establish one!
	// console.log("Opening new socket :D")

	// Await validatorama because it may be attempting to refresh our session,
	// in which case our session cookies will change
	await validatorama.waitUntilInitialRequestBack();

	let success = await openSocket();

	while (!success && !zeroSubs()) {
		// Request came back with an error
		noConnection = true;
		statustext.showStatusForDuration(
			translations['websocket'].no_connection,
			timeToResubAfterNetworkLossMillis,
		);
		invites.clearIfOnPlayPage(); // Erase on-screen invites.
		await thread.sleep(timeToResubAfterNetworkLossMillis);
		success = await openSocket();
	}
	// This is the only instance where we've reconnected.
	if (success && noConnection)
		statustext.showStatusForDuration(translations['websocket'].reconnected, 1000);
	noConnection = false;
	cancelAllTimerIDsToCancelOnNewSocket();

	// console.log("Established web socket connection!")
	openingSocket = false;
	return success;
}

/**
 * Attempts to open our web socket to the server.
 * @returns *true* if the socket was opened successfully.
 */
async function openSocket(): Promise<boolean> {
	onSocketUpgradeReqLeave();
	return new Promise((resolve, _reject) => {
		let url = `wss://${window.location.hostname}`;
		if (window.location.port !== '443') url += `:${window.location.port}`; // Enables localhost to work during development
		const ws = new WebSocket(url);
		ws.onopen = () => {
			onReqBack();
			socket = ws;
			resolve(true);
		}; // Resolve the promise with the WebSocket object
		ws.onerror = (_event) => {
			onReqBack();
			resolve(false);
		};
		ws.onmessage = onmessage;
		ws.onclose = onclose;
	});
}

/**
 * 1. Dispatches a socket opening event that lets other parts of our code know that we are attempting to open a websocket.
 * 2. Sets a timer that within a few seconds after we haven't heard a response from the server,
 * we assume we've lost connection, and display a message on screen. Then keep waiting.
 */
function onSocketUpgradeReqLeave(): void {
	dispatchOpeningSocketCustomEvent();
	reqOut = window.setTimeout(() => httpLostConnection(), timeToWaitForHTTPMillis);
}

/** Cancels the timer that assumes we've lost connection a few seconds after requesting an open socket. */
function onReqBack(): void {
	if (typeof reqOut !== 'boolean') clearTimeout(reqOut);
	reqOut = false;
}

/** Displays a message on screen "Lost connection",
 * and keeps stating that until we successfully open a websocket. */
function httpLostConnection(): void {
	noConnection = true;
	statustext.showStatusForDuration(
		translations['websocket'].no_connection,
		timeToWaitForHTTPMillis,
	);
	reqOut = window.setTimeout(() => httpLostConnection(), timeToWaitForHTTPMillis); // Keep saying we lost connection if we haven't heard back yet
	//console.log("Reset http timer")
}

/**
 * Call when we hear a server echo. This cancels the timer that assumes
 * we lost the connection and tries to renew it.
 */
function cancelTimerOfMessageID(message: WebsocketMessage): void {
	// { sub, action, value, id }
	const echoMessageID = message.value; // If the action is an "echo", the message ID their echo'ing is stored in "value"!

	const echoTimer = echoTimers[echoMessageID];
	if (!echoTimer) {
		console.error('Could not find echo timer for message.');
		return;
	}

	// How long did it take the message to return round trip?
	// Let's update the Ping meter
	const timeTaken = Date.now() - echoTimer.timeSent;
	const detail = timeTaken;
	document.dispatchEvent(new CustomEvent('ping', { detail }));

	const timeoutID = echoTimer.timeoutID;

	clearTimeout(timeoutID);
	delete echoTimers[echoMessageID];
	// console.log(`Canceled timeout of message id "${echoMessageID}"  New echoTimers:`)
	// console.log(echoTimers)
}

/**
 * Closes the current websocket when an echo hasn't been heard for a while. Displays "Lost connection".
 * The cause specified will cause us to automatically
 * try to reconnect a new websocket and resub to everything.
 * Called a few seconds after not hearing a server echo from one of our message.
 */
function renewConnection(messageID: MessageID): void {
	if (messageID) {
		// Delete the timeout ID that cancels the timer to renew the connection.
		delete echoTimers[messageID];
		// console.log(`Deleted echoTimer with message id ${messageID} after server didn't echo us. New echoTimers:`)
		// console.log(echoTimers);
	}
	if (!socket) return;
	console.log(
		`Renewing connection after we haven't received an echo for ${timeToWaitForEchoMillis} milliseconds...`,
	);
	dispatchLostConnectionCustomEvent();
	socket.close(1000, 'Connection closed by client. Renew.');
}

/**
 * Called when we receive an incoming server websocket message.
 * Sends an echo to the server, then routes the message to where it needs to go.
 * @param serverMessage - The incoming server's message's `data` property contains the stringified message contents.
 */
function onmessage(serverMessage: MessageEvent): void {
	// data: { sub, action, value, id, replyto }
	/** @type {WebsocketMessage} */
	let message;
	try {
		// Parse the stringified JSON message and translate the message from the server if a translation is available
		message = JSON.parse(serverMessage.data); // { sub, action, value, id }
	} catch (error) {
		return console.error('Error parsing incoming message as JSON:', error);
	}

	const isEcho = message.action === 'echo';

	if (DEBUG) {
		if (isEcho) {
			if (alsoPrintIncomingEchos) console.log(`Incoming message: ${JSON.stringify(message)}`);
		} else console.log(`Incoming message: ${JSON.stringify(message)}`);
	}

	if (isEcho) return cancelTimerOfMessageID(message);

	// Not an echo...

	const sub = message.sub;

	// Send our echo here! We always send an echo to every message EXCEPT echos themselves!
	sendmessage('general', 'echo', message.id);

	// Execute any on-reply function!
	executeOnreplyFunc(message.replyto);

	switch (
		sub // Route the message where it needs to go
	) {
		case undefined: // Basically a null message. They look like: { id, replyto }. This allows us to execute any on-reply func for the message we sent.
			break;
		case 'general':
			ongeneralmessage(message.action, message.value);
			break;
		case 'invites':
			invites.onmessage(message);
			break;
		case 'game':
			onlinegamerouter.routeMessage(message);
			break;
		default:
			console.error('Unknown socket subscription received from the server! Message:');
			return console.log(message);
	}
}

/**
 * Called when we receive an incoming server message with route "general".
 * @param action - The action the incoming server message specified to perform
 * @param value - The value of the incoming server message.
 */
function ongeneralmessage(action: string, value: WebsocketMessageValue): void {
	switch (action) {
		case 'notify':
			statustext.showStatus(value);
			break;
		case 'notifyerror':
			statustext.showStatus(value, true, 2);
			break;
		case 'print':
			console.log(value);
			break;
		case 'printerror':
			console.error(value);
			break;
		case 'renewconnection':
			// The server sends this empty message, expecting an echo from us,
			// just so it knows we are still connected and processing.
			break;
		case 'gameversion':
			// If the current version doesn't match, hard refresh.
			if (value !== GAME_VERSION) handleHardRefresh(value);
			break;
		default:
			console.log(
				`We don't know how to treat this server action in general route: Action "${action}". Value: ${value}`,
			);
	}
}

/**
 * Called when we receive an incoming server message with route "general" and action "notify" or "notifyerror"
 * @param {Object} messagevalue - An object of the form { text: "blabla", number: 32 }
 * @returns the translated text in messagevalue.text, potentially enhanced with messagevalue.number
 */
// function getTranslatedAndAssembledMessage(messagevalue){
//     let text = messagevalue.text;
//     if (translations[text]) text = translations[text];
//     if (number in messagevalue){
//         // special case: number of minutes to be displayed upon server restart
//         if (messagevalue.text === "ws-server_restarting"){
//             const minutes = Number(messagevalue.number); // Cast to number in case it's a string
//             const minutes_plurality = minutes === 1 ? translations["ws-minute"] : translations["ws-minutes"];
//             text = `${text} ${minutes} ${minutes_plurality}.`;
//         }
//     }
//     return text;
// }

/**
 * Attempts to hard refresh the page, bypassing the cache,
 * as long as we haven't already attempted to hard refresh for this version.
 * This prevents a cycle of endless refreshing if a browser doesn't support hard refreshing.
 * I don't have a way of getting them to hard refresh if this doesn't work, it will
 * try hard refreshing again 1 day from now.
 * @param LATEST_GAME_VERSION - The game version the server is currently running.
 */
function handleHardRefresh(LATEST_GAME_VERSION: string): void {
	// New update!

	const reloadInfo = {
		timeLastHardRefreshed: Date.now(),
		expectedVersion: LATEST_GAME_VERSION,
	};
	const preexistingHardRefreshInfo: HardRefreshInfo = localstorage.loadItem('hardrefreshinfo');
	if (preexistingHardRefreshInfo?.expectedVersion === LATEST_GAME_VERSION) {
		// Don't hard-refresh, we've already tried for this version.
		if (!preexistingHardRefreshInfo.refreshFailed)
			console.warn(
				`location.reload(true) failed to hard refresh. Server version: ${LATEST_GAME_VERSION}. Still running: ${GAME_VERSION}`,
			);
		preexistingHardRefreshInfo.refreshFailed = true;
		saveInfo(preexistingHardRefreshInfo);
		return;
	}
	saveInfo(reloadInfo);
	// @ts-expect-error This parameter does indeed exist -> https://developer.mozilla.org/en-US/docs/Web/API/Location/reload
	location.reload(true);

	function saveInfo(info: HardRefreshInfo): void {
		localstorage.saveItem('hardrefreshinfo', info, timeutil.getTotalMilliseconds({ hours: 4 })); // I think cloudflare caches scripts for 4 hours
	}
}

/**
 * Called when we our open socket fires the 'close' event.
 * Cancels all on-reply functions and echo timers that assume we've disconnected.
 * Depending on the closure reason, this may attempt to reconnect and resub to everything.
 * @param event - The 'close' event fired.
 */
function onclose(event: CloseEvent): void {
	if (config.DEV_BUILD) console.log('WebSocket connection closed:', event.code, event.reason);
	const wasFullyOpen = socket !== undefined; // Socket is only defined when it FULLY opens (and not immediatly closes from no network)

	socket = undefined;
	cancelAllEchoTimers(); // If the connection closed, we shouldn't expect any echo's for previous sent messages.
	resetOnreplyFuncs(); // Immediately invoke all functions we wanted to execute upon hearing replies.

	const trimmedReason = event.reason.trim();
	const notByChoice = wsutil.wasSocketClosureNotByTheirChoice(event.code, trimmedReason);
	// Dispatch an event to let other code know that that a websocket closed
	/**
	 * True if we want to show the loading animation.
	 *
	 * If it was closed, not by our choice, but we have nothing
	 * to be subscribed to, just close the ping meter anyway.
	 */
	const detail = notByChoice && !zeroSubs();
	document.dispatchEvent(new CustomEvent('socket-closed', { detail }));

	// See wsutil.js for all possible closure reasons!

	// Connection closed unexpectedly (network interrupted), OR the server is down.
	// We did nothing wrong on our part, it's okay to instantly try to reconnect!
	// But don't if the connection wasn't fully open or this creates spamming!
	if (event.code === 1006) {
		//console.error("Web socket connection closed unexpectedly. Reconnecting..")
		if (wasFullyOpen) resubAll();
		return;
	}

	switch (trimmedReason) {
		case 'Connection expired':
			// Reopen connection and resubscribe
			resubAll(); // Instantly reconnects.
			// setTimeout(resubAll, 5000); // Wait 5 seconds, used for dev testing
			break;
		case 'Connection closed by client':
			//console.log("Closed web socket successfully.")
			break;
		case 'Connection closed by client. Renew.': // We closed the socket after hearing no echo
			console.log('Closed web socket successfully. Renewing now..');
			resubAll(); // Instantly reconnects.
			break;
		case 'Unable to identify client IP address':
			statustext.showStatus(
				`${translations['websocket'].unable_to_identify_ip} ${translations['websocket'].please_report_bug}`,
				true,
				100,
			);
			invites.clearIfOnPlayPage(); // Erase on-screen invites.
			break; // Don't resub
		case 'Authentication needed': // We don't have a browser-id cookie
			onAuthenticationNeeded();
			break; // Don't resub
		case 'Logged out':
			document.dispatchEvent(new CustomEvent('logout')); // Our header and validatorama scripts may listen for this event
			resubAll(); // Instantly reconnects.
			break;
		case 'Too Many Requests. Try again soon.':
			statustext.showStatusForDuration(
				translations['websocket'].too_many_requests,
				timeToResubAfterTooManyRequestsMillis,
			);
			enterTimeout(timeToResubAfterTooManyRequestsMillis); // After timeout is over, we then resubscribe!
			break;
		case 'Message Too Big':
			statustext.showStatus(
				`${translations['websocket'].message_too_big} ${translations['websocket'].please_report_bug}`,
				true,
				3,
			);
			enterTimeout(timeToResubAfterMessageTooBigMillis);
			break;
		case 'Too Many Sockets':
			statustext.showStatus(
				`${translations['websocket'].too_many_sockets} ${translations['websocket'].please_report_bug}`,
				true,
				3,
			);
			window.setTimeout(() => resubAll(), timeToResubAfterTooManyRequestsMillis);
			break;
		case 'Origin Error':
			statustext.showStatus(
				`${translations['websocket'].origin_error} ${translations['websocket'].please_report_bug}`,
				true,
				3,
			);
			invites.clearIfOnPlayPage(); // Erase on-screen invites.
			enterTimeout(timeToResubAfterTooManyRequestsMillis); // After timeout is over, we then resubscribe!
			break;
		case 'No echo heard': // Client took too long to respond, assumed connection is broken
			dispatchLostConnectionCustomEvent();
			resubAll(); // Instantly reconnects.
			break;
		default:
			statustext.showStatus(
				`${translations['websocket'].connection_closed} "${trimmedReason}". Code: ${event.code}. ${translations['websocket'].please_report_bug}`,
				true,
				100,
			);
			console.error(
				'Unknown reason why the WebSocket connection was closed. Not reopening or resubscribing.',
			);
	}
}

function dispatchLostConnectionCustomEvent(): void {
	// Dispatch this custom event that the ping meter listens for, to know to display the loading animation
	document.dispatchEvent(new CustomEvent('connection-lost'));
}

function dispatchOpeningSocketCustomEvent(): void {
	document.dispatchEvent(new CustomEvent('socket-opening'));
}

/**
 * If we send too many requests to the server, we can get hit with
 * Too Many Requests, so temporarily enter timeout and don't reconnect.
 * @param timeMillis - The time to remain in timeout, in milliseconds.
 */
function enterTimeout(timeMillis: number): void {
	if (timeMillis === undefined)
		return console.error('Cannot enter timeout for an undefined amount of time!');
	if (inTimeout) return; // Already in timeout, don't spam timers!
	inTimeout = true;
	window.setTimeout(() => leaveTimeout(), timeMillis);
	invites.clearIfOnPlayPage();
}

/** Timeout from sending too many requests is over, try to reconnect and resub to everything. */
function leaveTimeout(): void {
	inTimeout = false;
	resubAll();
}

/**
 * Sends a message to the server with the provided route, action, and values
 * @param route - Where the server needs to forward this to. general/invites/game
 * @param action - What action to take within the route.
 * @param value - The contents of the message
 * @param isUserAction - Whether this message is a direct result of a user action. If so, and we happen to receive the "Too many requests" error, then that will be displayed on screen. Default: false
 * @param onreplyFunc An optional function to execute when we receive the server's response to this message, or to execute immediately if we can't establish a socket, or after 5 seconds if we don't hear anything back.
 * @returns *true* if the message was able to send.
 */
async function sendmessage(
	route: string,
	action: string,
	value?: WebsocketMessageValue,
	isUserAction?: boolean,
	onreplyFunc?: () => void,
): Promise<boolean> {
	// invites, createinvite, inviteinfo
	if (!(await establishSocket())) {
		if (isUserAction) statustext.showStatus(translations['websocket'].too_many_requests);
		if (onreplyFunc) onreplyFunc(); // Execute this now
		return false;
	}

	resetTimerToCloseSocket();

	let payload: {
		route: string;
		contents: {
			action: string;
			value: WebsocketMessageValue;
		};
		id?: number;
	};
	if (action === 'echo') {
		payload = {
			route: 'echo',
			contents: value,
		};
	} else {
		// Not an echo, so we need to send a message with an ID, and expect an echo back.
		payload = {
			route, // general/invites/game
			contents: {
				action, // sub/unsub/createinvite/cancelinvite/acceptinvite
				value, // sublist/inviteinfo
			},
			id: uuid.generateNumbID(10),
		};

		if (DEBUG) console.log(`Sending: ${JSON.stringify(payload)}`);

		// Set a timer. At the end, just assume we've disconnected and start again.
		// This will be canceled if we here the echo in time.
		echoTimers[payload.id!] = {
			timeSent: Date.now(),
			timeoutID: window.setTimeout(
				() => renewConnection(payload.id!),
				timeToWaitForEchoMillis,
			),
		};
		//console.log(`Set timer of message id "${payload.id}"`)

		scheduleOnreplyFunc(payload.id!, onreplyFunc);
	}

	if (!socket || socket.readyState !== WebSocket.OPEN) return false; // Closed state, can't send message.

	const stringifiedMessage = JSON.stringify(payload);

	if (DEBUG) {
		// Add a simulated delay to the message
		window.setTimeout(
			() => socket!.send(stringifiedMessage),
			simulatedWebsocketLatencyMillis_Debug,
		);
	} else socket.send(stringifiedMessage);

	return true;
}

/** Cancels all timers that assume we've disconnected if we don't hear an echo back.
 * Call this when the socket connection is terminated, because we obviously won't hear any more echos. */
function cancelAllEchoTimers(): void {
	for (const echoTimerEntry of Object.values(echoTimers)) {
		clearTimeout(echoTimerEntry.timeoutID);
	}
	echoTimers = {};
}

/**
 * Flags this outgoing message to, when we receive the server's response, execute a custom function.
 * @param messageID - The ID of the outgoing message
 * @param onreplyFunc - The function to execute when we receive the server's response, or never if the socket closes before then.
 */
function scheduleOnreplyFunc(messageID: MessageID, onreplyFunc?: () => void): void {
	if (!onreplyFunc) return;
	onreplyFuncs[messageID] = onreplyFunc;
}

/** When we receive an incoming message with the `replyto` property specified,
 * we execute the on-reply function for that message we sent. */
function executeOnreplyFunc(id: number): void {
	if (id === undefined) return;
	if (!onreplyFuncs[id]) return;
	onreplyFuncs[id]();
	delete onreplyFuncs[id];
}

/** Erases all on-reply functions we had scheduled.
 * Call when the socket is terminated. */
function resetOnreplyFuncs(): void {
	onreplyFuncs = {};
}

/** Cancels all timers that we wanted to cancel upon a new socket established. */
function cancelAllTimerIDsToCancelOnNewSocket(): void {
	timerIDsToCancelOnNewSocket.forEach((ID) => clearTimeout(ID));
}

/**
 * Adds a timer ID to cancel upon the next socket establishment.
 * @param ID
 */
function addTimerIDToCancelOnNewSocket(ID: number): void {
	timerIDsToCancelOnNewSocket.push(ID);
}

/** Closes the socket. Call this when it's no longer in use (we're not
 * subbed to anything). This auto-unsubs us from everything client-side.
 * The server will auto-unsub us from everything on that side. */
function closeSocket(): void {
	if (!socket) return;
	if (socket.readyState !== WebSocket.OPEN)
		return console.error("Cannot close socket because it's not open! Yet socket is defined.");
	// CAN'T CALL this or when we leave the page and hit the back button
	// to return, we won't be subscribed to the game no more and won't resync!
	// Normally, when we close the socket, we aren't subbed to anything anyway,
	// ONLY when closeSocket() is called before page leave.
	// unsubAll();
	socket.close(1000, 'Connection closed by client');
}

/** If we have zero subscriptions, reset the 10 second timer to terminate the socket connection. */
function resetTimerToCloseSocket(): void {
	clearTimeout(timeoutIDToAutoClose);
	if (zeroSubs())
		timeoutIDToAutoClose = window.setTimeout(() => closeSocket(), cushionBeforeAutoCloseMillis);
}

/** Returns true if we're currently not subscribed to anything */
function zeroSubs(): boolean {
	for (const sub of validSubs) if (subs[sub] === true) return false;
	return true;
}

// /** Unsubscribes us from all, client-side. Call when you close the socket.
//  * The server will auto-unsub us from everything. */
// function unsubAll() {
// 	for (const sub of validSubs) subs[sub] = false;
// }

/**
 * Called when the socket unexpectedly closes. This attempts to reopen
 * the socket and resubscribe to everything that we were subscribed to.
 * Games will have to be resynced.
 */
async function resubAll(): Promise<void> {
	if (config.DEV_BUILD) console.log('Resubbing all..');

	if (zeroSubs()) {
		noConnection = false; // We don't care if we are no longer connected if we don't even need an open socket.
		console.log('No subs to sub to.');
		return;
	} else {
		// 1+ subs
		if (!(await establishSocket())) return; // this only returns false when it fails AND there's no subs to sub to.
	}

	for (const sub of validSubs) {
		if (subs[sub] === false) continue; // Don't resub
		switch (sub) {
			case 'invites':
				await invites.subscribeToInvites(true); // Subscribe even though we think we are already subscribed (subs.invites === true)
				break;
			case 'game':
				onlinegame.resyncToGame();
				break;
			default:
				console.error(
					`Cannot resub to all subs after an unexpected socket closure with strange sub ${sub}!`,
				);
		}
	}
}

window.addEventListener('pageshow', function (event) {
	if (event.persisted) {
		// The page was loaded from the back/forward cache (bfcache)
		// console.log("Page was accessed using the back button or forward button.");
		console.log('Page was returned to using the back or forward button.');
		resubAll();
	} else {
		// The page was loaded normally
		// console.log("Page was accessed normally.");
	}
});

/**
 * This is called when the server closes our websocket connection upgrade request
 * due to us not having a browser-id cookie or being logged in.
 * This can happen rarely if we leave the Play page open for a whole week, long
 * enough for our browser-id cookie to expire, since we haven't renewed it yet.
 * Normally, visiting/refreshing the page will refresh the cookie.
 */
async function onAuthenticationNeeded(): Promise<void> {
	invites.clearIfOnPlayPage(); // Erase on-screen invites.

	// If this is the second time we're getting this message,
	// that means that cookies aren't working on this browser.
	const now = Date.now();
	if (lastTimeWeGotAuthorizationNeededMessage !== undefined) {
		const difference = now - lastTimeWeGotAuthorizationNeededMessage;
		if (difference < 1000 * 60 * 60 * 24) {
			statustext.showStatus(translations['websocket'].online_play_disabled);
			lastTimeWeGotAuthorizationNeededMessage = now;
			// Perhaps tell the play page to not try to open another socket?
			// Because this error will repeatedly pop up.
			// ...
			return;
		}
	}
	lastTimeWeGotAuthorizationNeededMessage = now;

	// This is the first time we're hearing this.
	// Don't worry, cookies are probably still supported,
	// we just have to request a new browser-id cookie before we
	// reopen our socket.

	await validatorama.refreshToken();
	resubAll();
}

/**
 * Whether we are subbed to the given subscription list.
 * @param sub - The name of the sub
 */
function areSubbedToSub(sub: 'invites' | 'game'): boolean {
	if (!validSubs.includes(sub)) throw Error(`Can't ask if we're subbed to invalid sub "${sub}".`);
	return subs[sub] !== false;
}

/**
 * Marks ourself as no longer subscribed to a subscription list.
 *
 * If our websocket happens to close unexpectedly, we won't re-subscribe to it.
 * @param sub - The name of the sub to delete
 */
function deleteSub(sub: 'invites' | 'game'): void {
	if (!validSubs.includes(sub)) throw Error(`Can't delete invalid sub "${sub}".`);
	subs[sub] = false;
}

/**
 * Unsubs from the provided subscription list,
 * informing the server we no longer want updates.
 * @param sub - The name of the sub to add
 */
function addSub(sub: 'invites' | 'game'): void {
	if (!validSubs.includes(sub)) throw Error(`Can't sub to invalid sub "${sub}".`);
	subs[sub] = true;
}

/**
 * Unsubs from the provided subscription list,
 * informing the server we no longer want updates.
 * @param {'invites' | 'game'} sub - The name of the sub to delete
 */
function unsubFromSub(sub: 'invites' | 'game'): void {
	if (!validSubs.includes(sub)) throw Error(`Can't unsub from invalid sub "${sub}".`);

	if (subs[sub] === false) return; // Already unsubbed.

	deleteSub(sub);
	// Tell the server we no longer want updates.
	sendmessage('general', 'unsub', sub);
}

export default {
	toggleDebug,
	closeSocket,
	sendmessage,
	areSubbedToSub,
	addSub,
	deleteSub,
	unsubFromSub,
	addTimerIDToCancelOnNewSocket,
};
