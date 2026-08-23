// src/server/socket/socketReceive.ts

/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * cancels their echo timer, sends an echo, then sends the message to our router.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundMessage } from '../../shared/serverbound.js';

import socketutil from '../../shared/util/socketutil.js';
import { ServerboundSchema } from '../../shared/serverbound.js';

import requestMeter from '../utility/requestMeter.js';
import { logZodError } from '../utility/zodlogger.js';
import { logSocketIn } from './socketLogger.js';
import { routeIncomingSocketMessage } from './messageRouter.js';
import { escapeLogNewlines, logEvents } from '../utility/logEvents.js';
import { cancelEchoTimer, rescheduleHeartbeatTimer, sendReceipt } from './socketSend.js';

// Functions ---------------------------------------------------------------------------

/**
 * Callback function that is executed whenever we receive an incoming websocket message.
 * Sends an echo (unless this message itself **is** an echo), rate limits,
 * logs the message, then routes the message where it needs to go.
 *
 * Oversized messages never reach here — the `ws` receiver rejects anything
 * over MAX_PAYLOAD_BYTES (see socketServer.ts) before it's ever buffered.
 */
function onmessage(ws: CustomWebSocket, rawMessage: Buffer): void {
	const messageStr = rawMessage.toString('utf8');
	const message = parseAndValidateMessage(messageStr);

	if (message === null) {
		// Log the invalid request for debugging (if it wasn't hand crafted)
		logAndRateLimitMessage(ws, messageStr);
		return;
	}

	if (message.route === 'echo') {
		// Deliberately unlogged and unmetered. An echo isn't traffic the client chose to send — we
		// oblige one per message WE send — so charging their budget for our own send volume would
		// close honest sockets. Safe: it's validated above, and handling one is an O(1) clearTimeout.
		cancelEchoTimer(ws, message.contents);
		return;
	}

	if (!logAndRateLimitMessage(ws, messageStr)) return; // Rate limited; socket already closed.

	// Send our own echo
	sendReceipt(ws, 'echo', message.id);
	// Their message is evidence the connection is alive
	rescheduleHeartbeatTimer(ws);
	// console.log('Received message: ' + rawMessage);
	try {
		routeIncomingSocketMessage(ws, message);
	} finally {
		// Acked even if the handler threw. The client releases its lock on this action when
		// the ack lands, and an action stuck outstanding forever is worse than one acked
		// after failing — the ack promises the message was handled, not that it succeeded.
		if (message.needsack) sendReceipt(ws, 'ack', message.id);
	}
}

/**
 * Parses and validates a raw websocket message string.
 * Sends the appropriate error to the client on failure.
 * Returns the parsed message on success, or null on failure.
 */
function parseAndValidateMessage(messageStr: string): ServerboundMessage | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(messageStr);
	} catch {
		// Should only be reachable from explicitly crafted messages, but thus far
		// no bots have exploited this. Safe to log in case it's ever a legit bug.
		logEvents(
			`Incoming websocket message is not JSON parseable. Message: "${escapeLogNewlines(messageStr)}"`,
			'errLog',
		);
		return null;
	}

	const result = ServerboundSchema.safeParse(parsed);
	if (!result.success) {
		// Should only be reachable from explicitly crafted messages, but thus far
		// no bots have exploited this. Safe to log in case it's ever a legit bug.
		logZodError(parsed, result.error, 'Received malformed websocket in-message.');
		return null;
	}

	return result.data;
}

/**
 * Logs an incoming socket message to wsInLog, then rate limits it.
 * Returns true if the message is allowed, or false if the message
 * is being rate limited and the socket has already been closed.
 */
function logAndRateLimitMessage(ws: CustomWebSocket, rawMessage: string): boolean {
	logSocketIn(ws, rawMessage); // Log every incoming message, even rate-limited ones.
	requestMeter.recordRecent();
	if (requestMeter.meter(ws.metadata.IP, ws.metadata.userAgent) !== undefined) {
		// Rate limited; close the socket.
		ws.close(1009, socketutil.ClosureReasons.TOO_MANY_REQUESTS);
		return false;
	}
	return true;
}

export { onmessage };
