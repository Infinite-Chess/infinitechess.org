// src/client/scripts/esm/game/websocket/socketclose.ts

/**
 * Handles websocket close events and reconnection logic.
 *
 * Determines the appropriate response to different closure reasons,
 * including reconnection, timeout, and user notification.
 */

import wsutil from '../../../../../shared/util/wsutil.js';

import toast from '../gui/toast.js';
import config from '../config.js';
import invites from '../misc/invites.js';
import socketsubs from './socketsubs.js';
import validatorama from '../../util/validatorama.js';
import socketmessages from './socketmessages.js';
import {
	dispatchLostConnectionCustomEvent,
	TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS,
	TIME_TO_RESUB_AFTER_MESSAGE_TOO_BIG_MILLIS,
} from './socketutil.js';

// Variables -------------------------------------------------------------------

let inTimeout = false;

/**
 * The last time the server closed our socket connection request because
 * we were missing a browser-id cookie, in millis since the Unix Epoch.
 */
let lastTimeWeGotAuthorizationNeededMessage: number | undefined;

/** Reference to the resubAll function, set by socketman to avoid circular deps. */
let resubAllFn: (() => Promise<void>) | undefined;

/** Registers the resubAll function from socketman. */
function registerResubAllFn(fn: () => Promise<void>): void {
	resubAllFn = fn;
}

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
 * @param socketWasDefined - Whether the socket was fully open before closing.
 * @param clearSocket - Callback to clear the socket reference in socketman.
 */
function onclose(event: CloseEvent, socketWasDefined: boolean, clearSocket: () => void): void {
	if (config.DEV_BUILD) console.log('WebSocket connection closed:', event.code, event.reason);

	clearSocket();
	socketmessages.cancelAllEchoTimers();
	socketmessages.resetOnreplyFuncs();

	const trimmedReason = event.reason.trim();
	const notByChoice = wsutil.wasSocketClosureNotByTheirChoice(event.code, trimmedReason);

	/**
	 * True if we want to show the loading animation.
	 * If closed not by our choice, but with no subscriptions, close the ping meter anyway.
	 */
	const detail = notByChoice && !socketsubs.zeroSubs();
	document.dispatchEvent(new CustomEvent('socket-closed', { detail }));

	// Connection closed unexpectedly (network interrupted) or server is down.
	if (event.code === 1006) {
		if (socketWasDefined) resubAllFn?.();
		return;
	}

	switch (trimmedReason) {
		case 'Connection expired':
			resubAllFn?.();
			break;
		case 'Connection closed by client':
			break;
		case 'Connection closed by client. Renew.':
			console.log('Closed web socket successfully. Renewing now..');
			resubAllFn?.();
			break;
		case 'Unable to identify client IP address':
			toast.show(
				`${translations['websocket'].unable_to_identify_ip} ${translations['websocket'].please_report_bug}`,
				{ error: true, durationMultiplier: 100 },
			);
			invites.clearIfOnPlayPage();
			break;
		case 'Authentication needed':
			onAuthenticationNeeded();
			break;
		case 'Logged out':
			document.dispatchEvent(new CustomEvent('logout'));
			resubAllFn?.();
			break;
		case 'Too Many Requests. Try again soon.':
			toast.show(translations['websocket'].too_many_requests, {
				durationMillis: TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS,
			});
			enterTimeout(TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS);
			break;
		case 'Message Too Big':
			toast.show(
				`${translations['websocket'].message_too_big} ${translations['websocket'].please_report_bug}`,
				{ error: true, durationMultiplier: 3 },
			);
			enterTimeout(TIME_TO_RESUB_AFTER_MESSAGE_TOO_BIG_MILLIS);
			break;
		case 'Too Many Sockets':
			toast.show(
				`${translations['websocket'].too_many_sockets} ${translations['websocket'].please_report_bug}`,
				{ error: true, durationMultiplier: 3 },
			);
			window.setTimeout(() => resubAllFn?.(), TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS);
			break;
		case 'Origin Error':
			toast.show(
				`${translations['websocket'].origin_error} ${translations['websocket'].please_report_bug}`,
				{ error: true, durationMultiplier: 3 },
			);
			invites.clearIfOnPlayPage();
			enterTimeout(TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS);
			break;
		case 'No echo heard':
			dispatchLostConnectionCustomEvent();
			resubAllFn?.();
			break;
		default:
			toast.show(
				`${translations['websocket'].connection_closed} "${trimmedReason}". Code: ${event.code}. ${translations['websocket'].please_report_bug}`,
				{ error: true, durationMultiplier: 100 },
			);
			console.error(
				'Unknown reason why the WebSocket connection was closed. Not reopening or resubscribing.',
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
	invites.clearIfOnPlayPage();
}

/** Timeout from sending too many requests is over, try to reconnect. */
function leaveTimeout(): void {
	inTimeout = false;
	resubAllFn?.();
}

// Authentication Handling -----------------------------------------------------

/**
 * Called when the server closes our websocket due to missing authentication.
 * Attempts to refresh the browser-id cookie and reconnect.
 */
async function onAuthenticationNeeded(): Promise<void> {
	invites.clearIfOnPlayPage();

	const now = Date.now();
	if (lastTimeWeGotAuthorizationNeededMessage !== undefined) {
		const difference = now - lastTimeWeGotAuthorizationNeededMessage;
		// 24 hours
		if (difference < 1000 * 60 * 60 * 24) {
			toast.show(translations['websocket'].online_play_disabled);
			lastTimeWeGotAuthorizationNeededMessage = now;
			return;
		}
	}
	lastTimeWeGotAuthorizationNeededMessage = now;

	await validatorama.refreshToken();
	resubAllFn?.();
}

export default {
	onclose,
	isInTimeout,
	registerResubAllFn,
};
