// src/client/scripts/esm/game/websocket/socketman.ts

/**
 * Manages the websocket connection lifecycle: opening, closing,
 * reconnecting, and resubscribing after unexpected disconnections.
 */

import toast from '../gui/toast.js';
import config from '../config.js';
import thread from '../../util/thread.js';
import invites from '../misc/invites.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import socketsubs from './socketsubs.js';
import socketclose from './socketclose.js';
import validatorama from '../../util/validatorama.js';
import socketrouter from './socketrouter.js';
import socketmessages from './socketmessages.js';
import {
	dispatchOpeningSocketCustomEvent,
	TIME_TO_WAIT_FOR_HTTP_MILLIS,
	TIME_TO_RESUB_AFTER_NETWORK_LOSS_MILLIS,
} from './socketutil.js';

// Variables -------------------------------------------------------------------

/** The websocket object used to communicate with the server. */
let socket: WebSocket | undefined;
/** True if currently attempting to create a socket connection. */
let openingSocket = false;
/**
 * The timeout ID of the timer to display lost connection
 * if we don't hear back after attempting to open a socket.
 */
let reqOut: false | number = false;
/**
 * True if we are having trouble connecting. If true, and we reconnect,
 * we'll display "Reconnected."
 */
let noConnection = false;

// Initialization --------------------------------------------------------------

(function init() {
	initListeners();
	// Register callbacks to break circular deps between socketman <-> socketmessages / socketclose
	socketmessages.registerCloseSocketFn(closeSocket);
	socketmessages.registerEstablishSocketFn(establishSocket);
	socketclose.registerResubAllFn(resubAll);
})();

/** Listens for the connection-lost custom event. */
function initListeners(): void {
	document.addEventListener('connection-lost', () => alertUserLostConnection());
}

/** Displays a toast notifying the user of lost connection. */
function alertUserLostConnection(): void {
	noConnection = true;
	toast.show(translations['websocket'].no_connection, {
		durationMillis: TIME_TO_WAIT_FOR_HTTP_MILLIS,
	});
}

// Socket Lifecycle ------------------------------------------------------------

/**
 * Repeatedly tries to open a websocket to the server until successful,
 * unless we are in timeout. Never opens more than one socket at a time.
 *
 * This NEVER needs to be called manually; {@link sendmessage} calls it automatically.
 * @returns *true* if a socket was successfully opened.
 */
async function establishSocket(): Promise<boolean> {
	if (socketclose.isInTimeout()) return false;

	while (openingSocket || (socket && socket.readyState !== WebSocket.OPEN)) {
		if (config.DEV_BUILD) console.log('Waiting for the socket to be established or closed..');
		await thread.sleep(100);
	}
	if (socket && socket.readyState === WebSocket.OPEN) return true;

	openingSocket = true;

	// Await validatorama because it may be refreshing our session cookies
	await validatorama.waitUntilInitialRequestBack();

	let success = await openSocket();

	while (!success && !socketsubs.zeroSubs()) {
		noConnection = true;
		toast.show(translations['websocket'].no_connection, {
			durationMillis: TIME_TO_RESUB_AFTER_NETWORK_LOSS_MILLIS,
		});
		invites.clearIfOnPlayPage();
		await thread.sleep(TIME_TO_RESUB_AFTER_NETWORK_LOSS_MILLIS);
		success = await openSocket();
	}

	if (success && noConnection)
		toast.show(translations['websocket'].reconnected, { durationMillis: 1000 });
	noConnection = false;
	socketmessages.cancelAllTimerIDsToCancelOnNewSocket();

	openingSocket = false;
	return success;
}

/**
 * Attempts to open our websocket to the server.
 * @returns *true* if the socket was opened successfully.
 */
async function openSocket(): Promise<boolean> {
	onSocketUpgradeReqLeave();
	return new Promise((resolve, _reject) => {
		let url = `wss://${window.location.hostname}`;
		if (window.location.port !== '443') url += `:${window.location.port}`;
		const ws = new WebSocket(url);
		ws.onopen = () => {
			onReqBack();
			socket = ws;
			socketmessages.setSocket(ws);
			resolve(true);
		};
		ws.onerror = (_event) => {
			onReqBack();
			resolve(false);
		};
		ws.onmessage = (event: MessageEvent) => socketrouter.onmessage(event);
		ws.onclose = (event: CloseEvent) => {
			const wasFullyOpen = socket !== undefined;
			socketclose.onclose(event, wasFullyOpen, clearSocket);
		};
	});
}

/**
 * Dispatches a socket-opening event and starts a timer
 * that assumes lost connection if no response arrives.
 */
function onSocketUpgradeReqLeave(): void {
	dispatchOpeningSocketCustomEvent();
	reqOut = window.setTimeout(() => httpLostConnection(), TIME_TO_WAIT_FOR_HTTP_MILLIS);
}

/** Cancels the timer that assumes lost connection. */
function onReqBack(): void {
	if (typeof reqOut !== 'boolean') clearTimeout(reqOut);
	reqOut = false;
}

/** Displays "Lost connection" and keeps repeating until we successfully connect. */
function httpLostConnection(): void {
	noConnection = true;
	toast.show(translations['websocket'].no_connection, {
		durationMillis: TIME_TO_WAIT_FOR_HTTP_MILLIS,
	});
	reqOut = window.setTimeout(() => httpLostConnection(), TIME_TO_WAIT_FOR_HTTP_MILLIS);
}

/** Closes the socket. Called when it's no longer in use (no active subscriptions). */
function closeSocket(): void {
	if (!socket) return;
	if (socket.readyState !== WebSocket.OPEN)
		return console.error("Cannot close socket because it's not open! Yet socket is defined.");
	socket.close(1000, 'Connection closed by client');
}

/** Clears the socket reference when the connection is closed. */
function clearSocket(): void {
	socket = undefined;
	socketmessages.setSocket(undefined);
}

// Resubscription --------------------------------------------------------------

/**
 * Called when the socket unexpectedly closes. Reopens the socket
 * and resubscribes to everything that was previously subscribed.
 */
async function resubAll(): Promise<void> {
	if (config.DEV_BUILD) console.log('Resubbing all..');

	if (socketsubs.zeroSubs()) {
		noConnection = false;
		console.log('No subs to sub to.');
		return;
	} else {
		if (!(await establishSocket())) return;
	}

	for (const sub of socketsubs.getValidSubs()) {
		if (!socketsubs.areSubbedToSub(sub as 'invites' | 'game')) continue;
		switch (sub) {
			case 'invites':
				await invites.subscribeToInvites(true);
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

// Page Navigation Handling ----------------------------------------------------

window.addEventListener('pageshow', function (event) {
	if (event.persisted) {
		console.log('Page was returned to using the back or forward button.');
		resubAll();
	}
});

export default {
	establishSocket,
	closeSocket,
};
