// src/server/socket/receiveSocketMessage.ts

/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * then sends the message to our router.
 */

import type { IncomingMessage } from 'http';
import type { CustomWebSocket } from './socketUtility.js';

import * as z from 'zod';

import socketUtility from './socketUtility.js';
import { GameSchema } from '../game/gamemanager/gamerouter.js';
import { logZodError } from '../utility/zodlogger.js';
import { InvitesSchema } from '../game/invitesmanager/invitesrouter.js';
import { GeneralSchema } from './generalrouter.js';
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
import { routeIncomingSocketMessage } from './socketRouter.js';
import { logEvents, logReqWebsocketIn } from '../middleware/logEvents.js';
import { rescheduleRenewConnection, sendSocketMessage } from './sendSocketMessage.js';

// Types --------------------------------------------------------------------------------------

/** The schema for validating all incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	z.strictObject({ id: z.int(), route: z.literal('general'), contents: GeneralSchema }),
	z.strictObject({ id: z.int(), route: z.literal('invites'), contents: InvitesSchema }),
	z.strictObject({ id: z.int(), route: z.literal('game'), contents: GameSchema }),
]);
/** Represents all possible types an incoming websocket message could be! */
export type WebsocketInMessage = z.infer<typeof MasterSchema>;

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
 * Rate limits, logs the message, then routes the message where it needs to go.
 */
function onmessage(req: IncomingMessage, ws: CustomWebSocket, rawMessage: Buffer): void {
	// Test if the message is too big. People could DDOS this way
	// THIS MAY NOT WORK if the bytes get read before we reach this part of the code, it could still DDOS us before we reject them.
	if (Buffer.byteLength(rawMessage) > maxWebsocketMessageSizeBytes) {
		logEvents(`Client sent too big a websocket message.`, 'reqLogRateLimited.txt');
		ws.close(1009, 'Message Too Big');
		return;
	}

	const messageStr = rawMessage.toString('utf8');

	let parsedUnvalidatedMessage: any;
	try {
		// Parse the stringified JSON message.
		// Incoming message is in binary data, which can also be parsed into JSON
		parsedUnvalidatedMessage = JSON.parse(messageStr);
	} catch (error: unknown) {
		if (!rateLimitAndLogMessage(req, ws, messageStr)) return; // The socket will have already been closed.
		const errText = `'Error parsing incoming message as JSON: ${JSON.stringify(error)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Invalid JSON format!`);
		return;
	}

	const zod_result = MasterSchema.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		sendSocketMessage(
			ws,
			'general',
			'notify',
			'Your browser is running outdated code, please hard refresh the page!',
		);
		logZodError(
			parsedUnvalidatedMessage,
			zod_result.error,
			'Received malformed websocket in-message.',
		);
		return;
	}

	// Validation was a success! Message contains valid parameters.

	if (!rateLimitAndLogMessage(req, ws, messageStr)) return; // The socket will have already been closed.

	// console.log('Received message: ' + rawMessage);

	rescheduleRenewConnection(ws); // We know they are connected, so reset this

	routeIncomingSocketMessage(ws, zod_result.data);
}

/**
 * Logs and rate limits on incoming socket message.
 * Returns true if the message is allowed, or false if the message
 * is being rate limited and the socket has already been closed.
 */
function rateLimitAndLogMessage(
	req: IncomingMessage,
	ws: CustomWebSocket,
	rawMessage: string,
): boolean {
	if (!rateLimitWebSocket(req, ws)) return false; // They are being rate limited, the socket will have already been closed.
	logReqWebsocketIn(ws, rawMessage); // Only logged the message if it wasn't rate limited.
	return true;
}

export { onmessage };
