// src/server/socket/receiveSocketMessage.ts

/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * cancels their echo timer, sends an echo, then sends the message to our router.
 */

import type { CustomWebSocket } from './socketUtility.js';
import type { ServerboundMessage } from '../../shared/serverbound.js';

import { ServerboundSchema } from '../../shared/serverbound.js';

import { logZodError } from '../utility/zodlogger.js';
import { logReqWebsocketIn } from './wsLogger.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
import { routeIncomingSocketMessage } from './socketRouter.js';
import { escapeLogNewlines, logEvents } from '../middleware/logEvents.js';
import { cancelEchoTimer, rescheduleHeartbeatTimer, sendEcho } from './sendSocketMessage.js';

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
		// Echo, don't log or route.
		cancelEchoTimer(ws, message.contents);
		return;
	}

	if (!logAndRateLimitMessage(ws, messageStr)) return; // Rate limited; socket already closed.

	// Send our own echo
	sendEcho(ws, message.id);
	// Their message is evidence the connection is alive
	rescheduleHeartbeatTimer(ws);
	// console.log('Received message: ' + rawMessage);
	routeIncomingSocketMessage(ws, message);
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
	logReqWebsocketIn(ws, rawMessage); // Log every incoming message, even rate-limited ones.
	if (!rateLimitWebSocket(ws)) return false; // Rate limited; the socket will have already been closed.
	return true;
}

export { onmessage };
