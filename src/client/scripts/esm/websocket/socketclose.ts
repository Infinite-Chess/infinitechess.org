// src/client/scripts/esm/websocket/socketclose.ts

/**
 * Handles websocket close events and reconnection logic.
 *
 * Determines the appropriate response to different closure reasons,
 * including reconnection, timeout, and user notification.
 */

import wsutil from '../../../../shared/util/wsutil.js';

import config from '../game/config.js';
import socketman from './socketman.js';
import socketsubs from './socketsubs.js';
import validatorama from '../util/validatorama.js';
import { SocketBus } from './SocketBus.js';
import socketmessages from './socketmessages.js';

// Constants -------------------------------------------------------------------

/** Time before attempting resub after too many requests. */
const timeToResubAfterTooManyRequestsMillis = 10000;
/** Time before attempting resub after message too big. */
const timeToResubAfterMessageTooBigMillis = 5000;

// Variables -------------------------------------------------------------------

let inTimeout = false;

/**
 * The last time the server closed our socket connection request because
 * we were missing a browser-id cookie, in millis since the Unix Epoch.
 */
let lastTimeWeGotAuthorizationNeededMessage: number | undefined;

/** Returns whether we're currently in a rate-limit timeout. */
function isInTimeout(): boolean {
	return inTimeout;
}

// Close Handler ---------------------------------------------------------------

/**
 * Called when our open socket fires the 'close' event.
 * Cancels echo timers and on-reply functions, then handles reconnection
 * based on the closure reason.
 * @param event - The 'close' event fired.
 */
function onclose(event: CloseEvent): void {
	if (config.DEV_BUILD) console.log('WebSocket connection closed:', event.code, event.reason);

	socketmessages.cancelAllEchoTimers();
	socketmessages.cancelInactivityTimer();
	socketmessages.resetOnreplyFuncs();

	const trimmedReason = event.reason.trim();
	const notByChoice = wsutil.wasSocketClosureNotByTheirChoice(event.code, trimmedReason);

	/**
	 * True if we want to show the loading animation.
	 * If closed not by our choice, but with no subscriptions, close the ping meter anyway.
	 */
	const unIntentional = notByChoice && !socketsubs.zeroSubs();
	SocketBus.dispatch('closed', unIntentional);

	// The server drops all subscriptions on close. Reconnect handlers should re-subscribe.
	socketsubs.clearAllSubs();

	// Connection closed unexpectedly (network interrupted) or server is down.
	// Schedule a reconnect — delay and resubAll() are handled inside scheduleReconnect().
	if (event.code === 1006) {
		socketman.scheduleReconnect();
		return;
	}

	switch (trimmedReason) {
		case 'Connection expired':
			socketman.resubAll();
			break;
		case 'Connection closed by client':
			break;
		case 'Connection closed by client. Renew.':
			console.log('Closed web socket successfully. Renewing now..');
			socketman.resubAll();
			break;
		case 'Unable to identify client IP address':
			console.error('Unable to identify IP when establishing socket.');
			break;
		case 'Authentication needed':
			onAuthenticationNeeded();
			break;
		case 'Logged out':
			validatorama.reloadAfterLogout();
			break;
		case 'Too Many Requests. Try again soon.':
			console.error('Too many requests when establishing socket.');
			enterTimeout(timeToResubAfterTooManyRequestsMillis);
			break;
		case 'Message Too Big':
			console.error('Message too big when establishing socket.');
			enterTimeout(timeToResubAfterMessageTooBigMillis);
			break;
		case 'Too Many Sockets':
			console.error('Too many sockets when establishing socket.');
			window.setTimeout(() => socketman.resubAll(), timeToResubAfterTooManyRequestsMillis);
			break;
		case 'Origin Error':
			console.error('Origin error when establishing socket.');
			enterTimeout(timeToResubAfterTooManyRequestsMillis);
			break;
		case 'No echo heard':
			socketman.dispatchLostConnectionCustomEvent();
			socketman.resubAll();
			break;
		default:
			console.error(
				`Socket closed unexpectedly. Server message: "${trimmedReason}". Code: ${event.code}.`,
			);
	}
}

// Timeout Management ----------------------------------------------------------

/**
 * Enters a rate-limit timeout period during which we won't reconnect.
 * @param timeMillis - The duration to remain in timeout, in milliseconds.
 */
function enterTimeout(timeMillis: number): void {
	if (timeMillis === undefined)
		return console.error('Cannot enter timeout for an undefined amount of time!');
	if (inTimeout) return;
	inTimeout = true;
	window.setTimeout(() => leaveTimeout(), timeMillis);
}

/** Timeout from sending too many requests is over, try to reconnect. */
function leaveTimeout(): void {
	inTimeout = false;
	socketman.resubAll();
}

// Authentication Handling -----------------------------------------------------

/**
 * Called when the server closes our websocket due to missing authentication.
 * Attempts to refresh the browser-id cookie and reconnect.
 */
async function onAuthenticationNeeded(): Promise<void> {
	// If this is the second time we're getting this message,
	// that means that cookies aren't working on this browser.
	const now = Date.now();
	if (lastTimeWeGotAuthorizationNeededMessage !== undefined) {
		const difference = now - lastTimeWeGotAuthorizationNeededMessage;
		// 24 hours
		if (difference < 1000 * 60 * 60 * 24) {
			console.error(
				'Cookies not supported on this browser. Cannot establish websocket connection.',
			);
			lastTimeWeGotAuthorizationNeededMessage = now;
			return;
		}
	}
	lastTimeWeGotAuthorizationNeededMessage = now;

	await validatorama.refreshToken();
	socketman.resubAll();
}

// Exports -------------------------------------------------------------------

export default {
	onclose,
	isInTimeout,
};
