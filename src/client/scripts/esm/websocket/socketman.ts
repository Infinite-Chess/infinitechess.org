// src/client/scripts/esm/websocket/socketman.ts

/**
 * Manages the websocket connection lifecycle: opening, closing,
 * reconnecting, and resubscribing after unexpected disconnections.
 * Also owns the socket instance and debug toggle.
 */

import config from '../game/config.js';
import thread from '../util/thread.js';
import socketclose from './socketclose.js';
import validatorama from '../util/validatorama.js';
import socketrouter from './socketrouter.js';
import { SocketBus } from './SocketBus.js';

// Constants -------------------------------------------------------------------

/** Time to wait for HTTP connection before assuming lost connection. */
const TIME_TO_WAIT_FOR_HTTP_MILLIS = 5000;
/**
 * Delays in milliseconds to wait before each reconnection attempt.
 * Indexed by consecutive failure count; the last element repeats indefinitely.
 */
const RECONNECT_DELAY_MILLIS = [0, 2500, 5000] as const;

// Variables -------------------------------------------------------------------

/** The websocket object used to communicate with the server. */
let socket: WebSocket | undefined;
/** True if currently attempting to create a socket connection. */
let openingSocket = false;
/**
 * True if we are having trouble connecting. If true, and we reconnect,
 * we'll display "Reconnected."
 */
let noConnection = false;
/** Number of consecutive failed connection attempts, used to determine reconnect delay. */
let consecutiveFailures = 0;
/** The timer ID for a pending scheduleReconnect() call, or undefined if none is pending. */
let reconnectTimerId: number | undefined;

/** Enables simulated websocket latency and prints all sent and received messages. */
let DEBUG = false;

// Initialization --------------------------------------------------------------

SocketBus.addEventListener('connection-lost', () => {
	noConnection = true;
	console.error('No connection.');
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
	console.log(`Toggled websocket latency: ${DEBUG}`);
}

// Socket Access ---------------------------------------------------------------

/** Returns the current websocket instance, or undefined if not connected. */
function getSocket(): WebSocket | undefined {
	return socket;
}

// Connection Events -----------------------------------------------------------

/** Dispatches a custom event indicating that websocket connection was lost. */
function dispatchLostConnectionCustomEvent(): void {
	SocketBus.dispatch('connection-lost');
}

// Socket Lifecycle ------------------------------------------------------------

/**
 * Schedules a reconnection attempt after the appropriate backoff delay.
 * Calls resubAll() only once the delay has elapsed, so the application
 * is never told to reconnect before we're actually ready to attempt it.
 */
function scheduleReconnect(): void {
	if (reconnectTimerId !== undefined) return;
	if (consecutiveFailures > 0) noConnection = true;
	const cappedIndex = Math.min(consecutiveFailures, RECONNECT_DELAY_MILLIS.length - 1);
	const delay = RECONNECT_DELAY_MILLIS[cappedIndex]!;
	reconnectTimerId = window.setTimeout(() => {
		reconnectTimerId = undefined;
		resubAll();
	}, delay);
}

/**
 * Tries once to open a websocket to the server.
 * Retries are driven externally: a failed attempt fires onclose,
 * which calls scheduleReconnect(), which calls resubAll() after a delay.
 * @returns Whether a socket was successfully opened.
 */
async function establishSocket(): Promise<boolean> {
	if (socketclose.isInTimeout()) return false;

	while (
		openingSocket ||
		reconnectTimerId !== undefined ||
		(socket && socket.readyState !== WebSocket.OPEN)
	) {
		if (config.DEV_BUILD) console.log('Waiting for the socket to be established or closed..');
		await thread.sleep(100);
	}
	if (socket && socket.readyState === WebSocket.OPEN) return true;

	openingSocket = true;

	// Await validatorama because it may be refreshing our session cookies
	await validatorama.waitUntilInitialRequestBack();

	const success = await openSocket();

	if (success) {
		consecutiveFailures = 0;
		if (noConnection) console.log('Reconnected.');
		noConnection = false;
	} else {
		consecutiveFailures++;
	}

	openingSocket = false;
	return success;
}

/**
 * Attempts to open our websocket to the server.
 * @returns Whether the socket was opened successfully.
 */
async function openSocket(): Promise<boolean> {
	SocketBus.dispatch('opening'); // Indicates a socket connection is opening
	const noResponseTimer = window.setTimeout(() => {
		noConnection = true;
		console.error('No connection.');
	}, TIME_TO_WAIT_FOR_HTTP_MILLIS);

	return new Promise((resolve, _reject) => {
		let url = `wss://${window.location.hostname}`;
		if (window.location.port !== '443') url += `:${window.location.port}`;
		const ws = new WebSocket(url);
		ws.onopen = () => {
			clearTimeout(noResponseTimer);
			socket = ws;
			resolve(true);
		};
		ws.onerror = (_event) => {
			clearTimeout(noResponseTimer);
			resolve(false);
		};
		ws.onmessage = (event: MessageEvent) => socketrouter.onmessage(event);
		ws.onclose = (event: CloseEvent) => {
			socket = undefined;
			socketclose.onclose(event);
		};
	});
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
 * Called when the socket unexpectedly closes. Notifies all subs to resubscribe.
 * Then socketmessages.send() lazily reopens the socket.
 */
function resubAll(): void {
	if (config.DEV_BUILD) console.log('Resubbing all..');
	SocketBus.dispatch('reconnected');
}

// Exports --------------------------------------------------------------------

export default {
	getSocket,
	establishSocket,
	closeSocket,
	scheduleReconnect,
	resubAll,
	toggleDebug,
	isDebugEnabled,
	dispatchLostConnectionCustomEvent,
};
