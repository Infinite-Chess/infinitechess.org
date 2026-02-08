// src/client/scripts/esm/game/websocket/socketman.ts

/**
 * Manages the websocket connection lifecycle: opening, closing,
 * reconnecting, and resubscribing after unexpected disconnections.
 * Also owns the socket instance and debug toggle.
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

// Constants -------------------------------------------------------------------

/** Time to wait for HTTP connection before assuming lost connection. */
const timeToWaitForHTTPMillis = 5000;
/** Time before attempting resub after network loss. */
const timeToResubAfterNetworkLossMillis = 5000;

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

/** Enables simulated websocket latency and prints all sent and received messages. */
let DEBUG = false;

// Initialization --------------------------------------------------------------

document.addEventListener('connection-lost', () => {
	// Displays a toast, notifying the user they lost connection.
	noConnection = true;
	toast.show(translations.websocket.no_connection, {
		durationMillis: timeToWaitForHTTPMillis,
	});
});

// Page navigation handling
window.addEventListener('pageshow', function (event) {
	if (event.persisted) {
		console.log('Page was returned to using the back or forward button.');
		resubAll();
	}
});

// Debug -----------------------------------------------------------------------

/** Returns whether debug mode is enabled. */
function isDebugEnabled(): boolean {
	return DEBUG;
}

/** Toggles debug mode on or off, showing a toast notification. */
function toggleDebug(): void {
	DEBUG = !DEBUG;
	toast.show(`Toggled websocket latency: ${DEBUG}`);
}

// Socket Access ---------------------------------------------------------------

/** Returns the current websocket instance, or undefined if not connected. */
function getSocket(): WebSocket | undefined {
	return socket;
}

// Connection Events -----------------------------------------------------------

/** Dispatches a custom event indicating that websocket connection was lost. */
function dispatchLostConnectionCustomEvent(): void {
	document.dispatchEvent(new CustomEvent('connection-lost'));
}

// Socket Lifecycle ------------------------------------------------------------

/**
 * Repeatedly tries to open a websocket to the server until successful,
 * unless we are in timeout. Never opens more than one socket at a time.
 * @returns Whether a socket was successfully opened.
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
		toast.show(translations.websocket.no_connection, {
			durationMillis: timeToResubAfterNetworkLossMillis,
		});
		invites.clearIfOnPlayPage();
		await thread.sleep(timeToResubAfterNetworkLossMillis);
		success = await openSocket();
	}

	if (success && noConnection)
		toast.show(translations.websocket.reconnected, { durationMillis: 1000 });
	noConnection = false;

	openingSocket = false;
	return success;
}

/**
 * Attempts to open our websocket to the server.
 * @returns Whether the socket was opened successfully.
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
			resolve(true);
		};
		ws.onerror = (_event) => {
			onReqBack();
			resolve(false);
		};
		ws.onmessage = (event: MessageEvent) => socketrouter.onmessage(event);
		ws.onclose = (event: CloseEvent) => {
			const wasFullyOpen = socket !== undefined;
			socket = undefined;
			socketclose.onclose(event, wasFullyOpen);
		};
	});
}

/**
 * Dispatches a socket-opening event and starts a timer
 * that assumes lost connection if no response arrives.
 */
function onSocketUpgradeReqLeave(): void {
	// Dispatches a custom event indicating that a socket connection is being opened.
	document.dispatchEvent(new CustomEvent('socket-opening'));
	reqOut = window.setTimeout(() => httpLostConnection(), timeToWaitForHTTPMillis);
}

/** Cancels the timer that assumes lost connection. */
function onReqBack(): void {
	if (typeof reqOut !== 'boolean') clearTimeout(reqOut);
	reqOut = false;
}

/** Displays "Lost connection" and keeps repeating until we successfully connect. */
function httpLostConnection(): void {
	noConnection = true;
	toast.show(translations.websocket.no_connection, {
		durationMillis: timeToWaitForHTTPMillis,
	});
	reqOut = window.setTimeout(() => httpLostConnection(), timeToWaitForHTTPMillis);
}

/** Closes the socket. Called when it's no longer in use (no active subscriptions). */
function closeSocket(): void {
	if (!socket) return;
	if (socket.readyState !== WebSocket.OPEN)
		return console.error("Cannot close socket because it's not open! Yet socket is defined.");
	socket.close(1000, 'Connection closed by client');
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

	for (const sub of socketsubs.validSubs) {
		if (!socketsubs.areSubbedToSub(sub)) continue;
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

// Exports --------------------------------------------------------------------

export default {
	getSocket,
	establishSocket,
	closeSocket,
	resubAll,
	toggleDebug,
	isDebugEnabled,
	dispatchLostConnectionCustomEvent,
};
