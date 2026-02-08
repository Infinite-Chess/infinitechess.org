// src/client/scripts/esm/game/websocket/socketrouter.ts

/**
 * Routes incoming websocket messages to the appropriate handler
 * based on the subscription type.
 */

import * as z from 'zod';

import timeutil from '../../../../../shared/util/timeutil.js';
import { GAME_VERSION } from '../../../../../shared/game_version.js';

import toast from '../gui/toast.js';
import invites from '../misc/invites.js';
import socketman from './socketman.js';
import LocalStorage from '../../util/LocalStorage.js';
import socketmessages from './socketmessages.js';
import { GameSchema } from '../misc/onlinegame/onlinegamerouter.js';
import onlinegamerouter from '../misc/onlinegame/onlinegamerouter.js';
import { InvitesSchema } from '../misc/invites.js';

// Schemas ---------------------------------------------------------------------

/** Zod schema for all possible incoming 'general' route messages from the server. */
const GeneralSchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('notify'), value: z.string() }),
	z.strictObject({ action: z.literal('notifyerror'), value: z.string() }),
	z.strictObject({ action: z.literal('print'), value: z.string() }),
	z.strictObject({ action: z.literal('printerror'), value: z.string() }),
	z.strictObject({ action: z.literal('renewconnection') }),
	z.strictObject({ action: z.literal('gameversion'), value: z.string() }),
]);

/** Represents all possible types an incoming 'general' route websocket message contents could be. */
type GeneralMessage = z.infer<typeof GeneralSchema>;

/** The schema for validating all non-echo incoming websocket messages. */
const MasterSchema = z.discriminatedUnion('route', [
	z.strictObject({
		id: z.number(),
		route: z.literal('general'),
		contents: GeneralSchema,
		replyto: z.number().optional(),
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('invites'),
		contents: InvitesSchema,
		replyto: z.number().optional(),
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('game'),
		contents: GameSchema,
		replyto: z.number().optional(),
	}),
]);

/** Represents all possible types a non-echo incoming websocket message could be. */
export type WebsocketInMessage = z.infer<typeof MasterSchema>;

/** The schema for validating incoming echo messages. */
const EchoSchema = z.object({
	/** The route, which is always 'echo' for echo messages. */
	route: z.literal('echo'),
	/** The contents of the echo message: the ID of the message being echoed. */
	contents: z.number(),
});

/** The schema for validating all incoming websocket messages, including echos. */
const MasterSchemaWithEchos = z.discriminatedUnion('route', [MasterSchema, EchoSchema]);

// Types -----------------------------------------------------------------------

/** Information about the last hard refresh we attempted. */
type HardRefreshInfo = {
	timeLastHardRefreshed: number;
	expectedVersion: string;
	refreshFailed?: boolean;
};

// Routing ---------------------------------------------------------------------

/**
 * Called when we receive an incoming server websocket message.
 * Validates it with Zod, sends an echo to the server, then routes the message.
 * @param serverMessage - The incoming server message event.
 */
function onmessage(serverMessage: MessageEvent): void {
	let parsedUnvalidatedMessage: any;
	try {
		parsedUnvalidatedMessage = JSON.parse(serverMessage.data);
	} catch (error) {
		return console.error('Error parsing incoming message as JSON:', error);
	}

	// Any incoming message proves the connection is alive.
	// Reschedule the inactivity timer that detects silent disconnections.
	socketmessages.rescheduleInactivityTimer();

	// Handle null messages (no route property). These are reply-only messages
	// (e.g. { id, replyto }) that only exist to execute on-reply functions.
	if (parsedUnvalidatedMessage.route === undefined) {
		if (typeof parsedUnvalidatedMessage.id === 'number')
			socketmessages.send('general', 'echo', parsedUnvalidatedMessage.id);
		if (typeof parsedUnvalidatedMessage.replyto === 'number')
			socketmessages.executeOnreplyFunc(parsedUnvalidatedMessage.replyto);
		return;
	}

	const zod_result = MasterSchemaWithEchos.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		console.error('Received malformed websocket message from the server:', zod_result.error);
		return;
	}

	// Validation was a success! Message contains valid parameters.

	const message = zod_result.data;

	if (socketman.isDebugEnabled()) {
		if (message.route === 'echo') {
			if (socketmessages.alsoPrintIncomingEchos)
				console.log(`Incoming message: ${JSON.stringify(message)}`);
		} else console.log(`Incoming message: ${JSON.stringify(message)}`);
	}

	if (message.route === 'echo') return socketmessages.cancelTimerOfMessageID(message.contents);

	// Not an echo...

	// Send our echo — we always echo every message EXCEPT echos themselves
	socketmessages.send('general', 'echo', message.id);

	// Execute any on-reply function
	socketmessages.executeOnreplyFunc(message.replyto);

	switch (message.route) {
		case 'general':
			ongeneralmessage(message.contents);
			break;
		case 'invites':
			invites.onmessage(message.contents);
			break;
		case 'game':
			onlinegamerouter.routeMessage(message.contents);
			break;
		default: {
			const exhaustiveCheck: never = message;
			console.error('Unknown socket subscription received from the server! Message:');
			console.log(exhaustiveCheck);
		}
	}
}

/**
 * Handles incoming messages with route "general".
 * @param message - The validated general route message contents
 */
function ongeneralmessage(message: GeneralMessage): void {
	switch (message.action) {
		case 'notify':
			toast.show(message.value);
			break;
		case 'notifyerror':
			toast.show(message.value, { error: true, durationMultiplier: 2 });
			break;
		case 'print':
			console.log(message.value);
			break;
		case 'printerror':
			console.error(message.value);
			break;
		case 'renewconnection':
			// Server sends this expecting an echo, to verify we're still connected.
			break;
		case 'gameversion':
			if (message.value !== GAME_VERSION) handleHardRefresh(message.value);
			break;
		default: {
			const exhaustiveCheck: never = message;
			console.log(
				`We don't know how to treat this server action in general route: ${JSON.stringify(exhaustiveCheck)}`,
			);
		}
	}
}

/**
 * Attempts a hard refresh if the server reports a newer game version.
 * Prevents endless refreshing cycles for browsers that don't support hard refresh.
 * @param LATEST_GAME_VERSION - The game version the server is currently running.
 */
function handleHardRefresh(LATEST_GAME_VERSION: string): void {
	const reloadInfo = {
		timeLastHardRefreshed: Date.now(),
		expectedVersion: LATEST_GAME_VERSION,
	};
	const preexistingHardRefreshInfo: HardRefreshInfo = LocalStorage.loadItem('hardrefreshinfo');
	if (preexistingHardRefreshInfo?.expectedVersion === LATEST_GAME_VERSION) {
		if (!preexistingHardRefreshInfo.refreshFailed)
			console.warn(
				`location.reload(true) failed to hard refresh. Server version: ${LATEST_GAME_VERSION}. Still running: ${GAME_VERSION}`,
			);
		preexistingHardRefreshInfo.refreshFailed = true;
		saveInfo(preexistingHardRefreshInfo);
		return;
	}
	saveInfo(reloadInfo);
	// @ts-expect-error This parameter does indeed exist -> https://developer.mozilla.org/en-US/docs/Web/API/Location/reload
	location.reload(true);

	function saveInfo(info: HardRefreshInfo): void {
		LocalStorage.saveItem('hardrefreshinfo', info, timeutil.getTotalMilliseconds({ hours: 4 })); // I think cloudflare caches scripts for 4 hours
	}
}

// Exports --------------------------------------------------------------------

export default {
	onmessage,
};
