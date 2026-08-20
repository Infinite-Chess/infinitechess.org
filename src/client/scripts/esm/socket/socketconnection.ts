// src/client/scripts/esm/socket/socketconnection.ts

/**
 * Manages the websocket connection lifecycle: opening, closing,
 * reconnecting, and resubscribing after unexpected disconnections.
 * Also owns the socket instance, and the timer that closes it once idle.
 */

import socketutil from '../../../../shared/util/socketutil.js';

import config from '../board/config.js';
import thread from '../util/thread.js';
import socketsubs from './socketsubs.js';
import socketclose from './socketclose.js';
import socketreceive from './socketreceive.js';
import { SocketBus } from './SocketBus.js';

// Constants -------------------------------------------------------------------

/** Time to wait for HTTP connection before assuming lost connection. */
const TIME_TO_WAIT_FOR_HTTP_MILLIS = 5000;
/** Time the websocket remains open without subscriptions, in milliseconds. */
const AUTO_CLOSE_CUSHION = 10000;
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
/** The timeout ID that auto-closes the socket when we're not subscribed to anything. */
let timeoutIDToAutoClose: number;

// Listeners --------------------------------------------------------------

SocketBus.addEventListener('connection-lost', () => {
	noConnection = true;
	console.error('No connection.');
});

// Close the socket with a controlled code before the page is unloaded, so the server knows
// to not give us a grace period for reconnection. CANNOT USE 'pagehide' because that doesn't
// reliably fire the close event before we leave, but defers it for when we RETURN, causing reconnection issues.
window.addEventListener('beforeunload', closeSocket);

// Page navigation handling
window.addEventListener('pageshow', (event) => {
	if (!event.persisted) return; // Page loaded normally
	console.log('Page was returned to using the back or forward button.');
	resubAll();
});

// Socket Access ---------------------------------------------------------------

/** Returns the current websocket instance, or undefined if not connected. */
function getSocket(): WebSocket | undefined {
	return socket;
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
		ws.onmessage = (event: MessageEvent) => socketreceive.onmessage(event);
		ws.onclose = (event: CloseEvent) => {
			socket = undefined;
			socketclose.onclose(event.code, event.reason);
		};
	});
}

/**
 * If we have zero subscriptions, resets the timer to auto-close the socket.
 * Called every time we put a message on the wire.
 */
function resetIdleCloseTimer(): void {
	clearTimeout(timeoutIDToAutoClose);
	if (socketsubs.zeroSubs()) {
		timeoutIDToAutoClose = window.setTimeout(() => closeSocket(), AUTO_CLOSE_CUSHION);
	}
}

/** Closes the socket. Called when it's no longer in use (no active subscriptions). */
function closeSocket(): void {
	if (!socket) return;
	if (socket.readyState !== WebSocket.OPEN)
		return console.error("Cannot close socket because it's not open! Yet socket is defined.");
	socket.close(1000, socketutil.ClosureReasons.CLOSED_BY_CLIENT);
}

/**
 * Tears the socket down at once, for when we've already concluded the connection is dead.
 *
 * Browsers expose no terminate(), and a severed network stalls the 'close' event for tens of
 * seconds while the closing handshake goes unanswered — yet every consequence of the
 * disconnection, telling the user included, waits on that event. So we send the close frame in
 * case the wire turns out to be fine, then stop listening and run the teardown ourselves.
 */
function dropSocket(): void {
	if (!socket) return;
	const dropped = socket;
	socket = undefined;
	// Anything this socket does from here — a late close, a message once the network returns —
	// is moot, and must not reach a session that has since opened a replacement.
	dropped.onclose = null;
	dropped.onmessage = null;
	// The reason is for the server alone, should the frame still land: it grants us the
	// reconnection grace period, where a plain client closure would cost us our seek.
	dropped.close(1000, socketutil.ClosureReasons.CLOSED_BY_CLIENT_RENEW);
	socketclose.onclose(1006, ''); // Report it as the abnormal closure it is.
}

// Resubscription --------------------------------------------------------------

/**
 * Called when the socket unexpectedly closes. Notifies all subs to resubscribe.
 * Then socketsend.send() lazily reopens the socket.
 */
function resubAll(): void {
	if (config.DEV_BUILD) console.log('Resubbing all..');
	SocketBus.dispatch('reconnect');
}

// Exports --------------------------------------------------------------------

export default {
	getSocket,
	establishSocket,
	resetIdleCloseTimer,
	closeSocket,
	dropSocket,
	scheduleReconnect,
	resubAll,
};
