// src/client/scripts/esm/socket/socketclose.ts

/**
 * Handles websocket close events and reconnection logic.
 *
 * Determines the appropriate response to different closure reasons,
 * including reconnection, timeout, and user notification.
 */

import socketutil from '../../../../shared/util/socketutil.js';

import toast from '../components/toast.js';
import docutil from '../util/docutil.js';
import socketsubs from './socketsubs.js';
import socketsend from './socketsend.js';
import validatorama from '../util/validatorama.js';
import { SocketBus } from './SocketBus.js';
import socketconnection from './socketconnection.js';

// Constants -------------------------------------------------------------------

/** Time before attempting resub after too many requests. */
const timeToResubAfterTooManyRequestsMs = 10000;

// Variables -------------------------------------------------------------------

let inTimeout = false;

/** Returns whether we're currently in a rate-limit timeout. */
function isInTimeout(): boolean {
	return inTimeout;
}

// Close Handler ---------------------------------------------------------------

/**
 * Runs the teardown for a socket that is no longer connected.
 * Cancels echo timers and on-reply functions, then handles reconnection
 * based on the closure reason.
 * @param code - The closure code.
 * @param reason - The reason given for the closure.
 */
function onclose(code: number, reason: string): void {
	if (docutil.DEV_BUILD) console.log('WebSocket connection closed:', code, reason);

	socketsend.clearPendingState();

	const trimmedReason = reason.trim();
	const involuntary = socketutil.wasSocketClosureInvoluntary(code, trimmedReason);

	SocketBus.dispatch('closed');
	// An involuntary close (with subs to reconnect for) means we lost the connection and
	// will retry. Dispatched after `closed` so its handlers — e.g. the ping meter's loading
	// state — override the generic close behavior.
	if (involuntary && !socketsubs.zeroSubs()) SocketBus.dispatch('connection-lost');

	// The server drops all subscriptions on close. Reconnect handlers should re-subscribe.
	socketsubs.clearAllSubs();

	// Connection closed unexpectedly (network interrupted) or server is down/restarting.
	// Schedule a reconnect — delay and resubAll() are handled inside scheduleReconnect().
	if (code === 1006) {
		socketconnection.scheduleReconnect();
		return;
	}

	if (code === 1001) return; // "going away": Page unloaded

	// Narrows the reason to a known closure reason. The switch below is already exhaustive.
	if (!socketutil.isClosureReason(trimmedReason)) {
		console.error(`Socket closed unexpectedly. Server message: "${trimmedReason}". Code: ${code}.`); // prettier-ignore
		return;
	}

	switch (trimmedReason) {
		case socketutil.ClosureReasons.CONNECTION_EXPIRED:
			socketconnection.resubAll();
			break;
		// Our own frames, echoed back by the server. The RENEW one can't actually reach us —
		// dropSocket() detaches onclose before sending it — but the switch is exhaustive.
		case socketutil.ClosureReasons.CLOSED_BY_CLIENT:
		case socketutil.ClosureReasons.CLOSED_BY_CLIENT_RENEW:
			break;
		case socketutil.ClosureReasons.UNIDENTIFIABLE_IP:
			console.error('Unable to identify IP when establishing socket.');
			break;
		case socketutil.ClosureReasons.USER_AGENT_REQUIRED:
			// A browser always sends one, so this means our request never reached the server intact.
			console.error('User agent missing when establishing socket.');
			break;
		case socketutil.ClosureReasons.AUTHENTICATION_NEEDED:
			// Called when the server closes our websocket due to missing authentication.
			toast.show(t.shared.socket.cookies_required, { error: true });
			break;
		case socketutil.ClosureReasons.LOGGED_OUT:
			validatorama.reloadAfterLogout();
			break;
		case socketutil.ClosureReasons.TOO_MANY_REQUESTS:
			console.error('Too many requests when establishing socket.');
			enterTimeout();
			break;
		case socketutil.ClosureReasons.TOO_MANY_SOCKETS:
			console.error('Too many sockets when establishing socket.');
			window.setTimeout(() => socketconnection.resubAll(), timeToResubAfterTooManyRequestsMs);
			break;
		case socketutil.ClosureReasons.ORIGIN_ERROR:
			console.error('Origin error when establishing socket.');
			enterTimeout();
			break;
		default:
			console.error('Socket closed for an unhandled reason!', trimmedReason satisfies never); // prettier-ignore
	}
}

// Timeout Management ----------------------------------------------------------

/**
 * Enters a rate-limit timeout period during which we won't reconnect.
 */
function enterTimeout(): void {
	if (inTimeout) return;
	inTimeout = true;
	window.setTimeout(() => leaveTimeout(), timeToResubAfterTooManyRequestsMs);
}

/** Timeout from sending too many requests is over, try to reconnect. */
function leaveTimeout(): void {
	inTimeout = false;
	socketconnection.resubAll();
}

// Exports ---------------------------------------------------------------------

export default {
	onclose,
	isInTimeout,
};
