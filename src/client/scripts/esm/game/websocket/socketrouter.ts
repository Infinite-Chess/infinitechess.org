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
import onlinegamerouter from '../misc/onlinegame/onlinegamerouter.js';

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
		contents: invites.InvitesSchema,
		replyto: z.number().optional(),
	}),
	z.strictObject({
		id: z.number(),
		route: z.literal('game'),
		contents: onlinegamerouter.GameSchema,
		replyto: z.number().optional(),
	}),
]);

/** Represents all possible types a non-echo incoming websocket message could be. */
export type WebsocketInMessage = z.infer<typeof MasterSchema>;

/** The schema for validating all incoming websocket messages, including echos and reply-only messages. */
const MasterSchemaWithEchos = z.discriminatedUnion('route', [
	MasterSchema,
	// Echo messages
	z.strictObject({
		route: z.literal('echo'),
		contents: z.number(),
	}),
	// Reply-only messages (no route property, only exist to execute on-reply functions)
	z.strictObject({
		route: z.undefined(),
		id: z.number(),
		replyto: z.number(),
	}),
]);

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

	const zod_result = MasterSchemaWithEchos.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		toast.show(translations.websocket.malformed_message, { error: true });
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

	// Handle reply-only messages (no route property).
	// These exist only to execute on-reply functions.
	if (message.route === undefined) {
		socketmessages.send('general', 'echo', message.id);
		socketmessages.executeOnreplyFunc(message.replyto);
		return;
	}

	// Not an echo or reply-only...

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
		default:
			console.error(
				// @ts-ignore
				`Unknown socket subscription "${message.route}" received from the server!`,
			);
			break;
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
		default:
			// @ts-ignore
			console.log(`Unknown server action "${message.action}" in general route.`);
			break;
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
