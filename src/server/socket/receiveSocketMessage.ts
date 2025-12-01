// src/server/socket/receiveSocketMessage.ts

/**
 * This script receives incoming socket messages, rate limits them, logs them,
 * cancels their echo timer, sends an echo, then sends the message to our router.
 */

import * as z from 'zod';

// @ts-ignore
import { rateLimitWebSocket } from '../middleware/rateLimit.js';
// @ts-ignore
import { logEvents, logEventsAndPrint, logReqWebsocketIn } from '../middleware/logEvents.js';
// @ts-ignore
import { printIncomingAndOutgoingMessages } from '../config/config.js';
import { deleteEchoTimerForMessageID } from './echoTracker.js';
import { rescheduleRenewConnection, sendSocketMessage } from './sendSocketMessage.js';
import { routeIncomingSocketMessage } from './socketRouter.js';
import socketUtility from './socketUtility.js';

// Zod schemas
import { InvitesSchema } from '../game/invitesmanager/invitesrouter.js';
import { GameSchema } from '../game/gamemanager/gamerouter.js';
import { GeneralSchema } from './generalrouter.js';

// Type Definitions ---------------------------------------------------------------------------

import type { CustomWebSocket } from './socketUtility.js';
import type { IncomingMessage } from 'http';

/** The schema for validating all non-echo incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	z.strictObject({ id: z.int(), route: z.literal('general'), contents: GeneralSchema }),
	z.strictObject({ id: z.int(), route: z.literal('invites'), contents: InvitesSchema }),
	z.strictObject({ id: z.int(), route: z.literal('game'), contents: GameSchema }),
]);
/** Represents all possible types a non-echo incoming websocket message could be! */
type WebsocketInMessage = z.infer<typeof MasterSchema>;

/** This is the id of the message being replied to. */
const EchoSchema = z.int();
type EchoMessage = z.infer<typeof EchoSchema>;

/** The schema for validating all incoming websocket messages, including echos. */
const MasterSchemaWithEchos = z.discriminatedUnion('route', [
	z.strictObject({
		/** The route to forward the message to (e.g., "general", "invites", "game"). */
		route: z.literal('echo'),
		/** The contents of the message, for the router to read. */
		contents: EchoSchema,
	}),
	MasterSchema,
]);
/** Represents all possible types an incoming websocket message could be, including echos! */
type WebsocketInMessageOrEcho = z.infer<typeof MasterSchemaWithEchos>;

// Functions ---------------------------------------------------------------------------

/**
 * Callback function that is executed whenever we receive an incoming websocket message.
 * Sends an echo (unless this message itself **is** an echo), rate limits,
 * logs the message, then routes the message where it needs to go.
 */
function onmessage(req: IncomingMessage, ws: CustomWebSocket, rawMessage: Buffer): void {
	const messageStr = rawMessage.toString('utf8');

	let parsedUnvalidatedMessage: any;
	try {
		// Parse the stringified JSON message.
		// Incoming message is in binary data, which can also be parsed into JSON
		parsedUnvalidatedMessage = JSON.parse(messageStr);
	} catch (error) {
		if (!rateLimitAndLogMessage(req, ws, messageStr)) return; // The socket will have already been closed.
		const errText = `'Error parsing incoming message as JSON: ${JSON.stringify(error)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEvents(errText, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', `Invalid JSON format!`);
		return;
	}

	const zod_result = MasterSchemaWithEchos.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		sendSocketMessage(
			ws,
			'general',
			'notifyerror',
			'Invalid websocket message parameters. This is a bug, please report it!',
		);
		const logText = `INVALID PARAMETERS - Message contents:
${JSON.stringify(parsedUnvalidatedMessage, null, 2)}

Zod treeified errors:
${zod_result.error instanceof z.ZodError ? JSON.stringify(z.treeifyError(zod_result.error), null, 2) : String(zod_result.error)}

Websocket metadata:
${socketUtility.stringifySocketMetadata(ws)}

===================================================================

`;
		logEvents(logText, 'wsInMalformedLog.txt');
		logEventsAndPrint(
			`Received malformed websocket in-message. Check wsInMalformedLog.txt for details.`,
			'errLog.txt',
		);
		return;
	}

	// Validation was a success! Message contains valid parameters.

	const message: WebsocketInMessageOrEcho = zod_result.data;

	if (message.route === 'echo') {
		const incomingEcho: EchoMessage = message.contents;
		const validEcho = deleteEchoTimerForMessageID(incomingEcho); // Cancel timer to assume they've disconnected
		if (!validEcho) {
			if (!rateLimitAndLogMessage(req, ws, messageStr)) return; // The socket will have already been closed.
			console.error(
				`User detected sending invalid echo! Message: "${JSON.stringify(message)}". Metadataction: ${socketUtility.stringifySocketMetadata(ws)}`,
			);
		}
		return;
	}

	// Not an echo...

	if (!rateLimitAndLogMessage(req, ws, messageStr)) return; // The socket will have already been closed.

	// Send our echo here! We always send an echo to every message except echos themselves.
	sendSocketMessage(ws, 'general', 'echo', message.id);

	if (printIncomingAndOutgoingMessages) console.log('Received message: ' + rawMessage);

	rescheduleRenewConnection(ws); // We know they are connected, so reset this

	routeIncomingSocketMessage(ws, message);
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

export type { WebsocketInMessage };
