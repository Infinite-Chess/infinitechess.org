// src/server/socket/receiveSocketMessage.ts

/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * cancels their echo timer, sends an echo, then sends the message to our router.
 */

import type { CustomWebSocket } from './socketUtility.js';

import * as z from 'zod';

import { GameSchema } from '../game/gamemanager/gamerouter.js';
import { logZodError } from '../utility/zodlogger.js';
import { LobbySchema } from '../game/seeksmanager/lobbyrouter.js';
import { GeneralSchema } from './generalrouter.js';
import { logReqWebsocketIn } from './wsLogger.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
import { routeIncomingSocketMessage } from './socketRouter.js';
import { deleteEchoTimerForMessageID } from './echoTracker.js';
import { escapeLogControlChars, logEvents } from '../middleware/logEvents.js';
import { rescheduleHeartbeatTimer, sendSocketMessage } from './sendSocketMessage.js';

// Types --------------------------------------------------------------------------------------

/** Represents all possible types a non-echo incoming websocket message could be! */
export type WebsocketInMessage = z.infer<typeof MasterSchema>;
/** The schema for validating all non-echo incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	z.strictObject({ id: z.int(), route: z.literal('general'), contents: GeneralSchema }),
	z.strictObject({ id: z.int(), route: z.literal('lobby'), contents: LobbySchema }),
	z.strictObject({ id: z.int(), route: z.literal('game'), contents: GameSchema }),
]);

/** This is the id of the message being replied to. */
const EchoSchema = z.strictObject({
	/** The route to forward the message to (e.g., "general", "lobby", "game"). */
	route: z.literal('echo'),
	/** The contents of the message, for the router to read. */
	contents: z.int(),
});

type AnyIncomingMessage = z.infer<typeof MasterSchemaWithEchos>;
/** The schema for validating all incoming websocket messages, including echos. */
const MasterSchemaWithEchos = z.discriminatedUnion('route', [MasterSchema, EchoSchema]);

// Constants ---------------------------------------------------------------------------

/**
 * The maximum size of an incoming websocket message, in bytes.
 * Above this will be rejected, and an error sent to the client.
 *
 * DIRECTLY CONTROLS THE maximum distance players can move in online games!
 * 500 KB allows moves up to 1e100000 squares away, with some padding.
 * On mobile it would take 6 hours of zooming out at
 * MAXIMUM speed to reach that distance, without rest.
 * It would take WAYYYY longer on desktop!
 */
const maxWebsocketMessageSizeBytes = 500_000; // 500 KB

// Functions ---------------------------------------------------------------------------

/**
 * Callback function that is executed whenever we receive an incoming websocket message.
 * Sends an echo (unless this message itself **is** an echo), rate limits,
 * logs the message, then routes the message where it needs to go.
 */
function onmessage(ws: CustomWebSocket, rawMessage: Buffer): void {
	// Test if the message is too big. People could DDOS this way
	// THIS MAY NOT WORK if the bytes get read before we reach this part of the code, it could still DDOS us before we reject them.
	if (Buffer.byteLength(rawMessage) > maxWebsocketMessageSizeBytes) {
		logEvents(`Client sent too big a websocket message.`, 'hackLog');
		ws.close(1009, 'Message Too Big');
		return;
	}

	const messageStr = rawMessage.toString('utf8');
	const message = parseAndValidateMessage(messageStr);

	if (message === null) {
		// Log the invalid request for debugging (if it wasn't hand crafted)
		logAndRateLimitMessage(ws, messageStr);
		return;
	}

	if (message.route === 'echo') {
		// Echo, don't log or route.
		deleteEchoTimerForMessageID(message.contents);
		return;
	}

	if (!logAndRateLimitMessage(ws, messageStr)) return; // Rate limited; socket already closed.

	// Send our own echo
	sendSocketMessage(ws, 'general', 'echo', message.id);
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
function parseAndValidateMessage(messageStr: string): AnyIncomingMessage | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(messageStr);
	} catch {
		// Should only be reachable from explicitly crafted messages, but thus far
		// no bots have exploited this. Safe to log in case it's ever a legit bug.
		logEvents(
			`Incoming websocket message is not JSON parseable. Message: "${escapeLogControlChars(messageStr)}"`,
			'errLog',
		);
		return null;
	}

	const result = MasterSchemaWithEchos.safeParse(parsed);
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
