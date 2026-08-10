// src/client/scripts/esm/websocket/socketrouter.ts

/**
 * Routes incoming websocket messages to the appropriate handler
 * based on the subscription type.
 */

import type { ClientboundGeneralMessage } from '../../../../shared/clientbound.js';

import * as z from 'zod';

import wsutil from '../../../../shared/util/wsutil.js';
import { ClientboundSchema } from '../../../../shared/clientbound.js';

import toast from '../components/toast.js';
import socketman from './socketman.js';
import { SocketBus } from './SocketBus.js';
import socketmessages from './socketmessages.js';

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
	socketmessages.rescheduleHeartbeatTimer();

	const zod_result = ClientboundSchema.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		console.error(
			'Received malformed websocket message from the server:',
			parsedUnvalidatedMessage,
		);
		console.error('Error:', z.prettifyError(zod_result.error));
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
	// TEMPORARY. TO HELP DEBUG why zod errors are happening all the time on the server!
	if (message.id === undefined) {
		console.error(
			'Received routed message without id field. This should not happen after Zod validation. Route:',
			message.route,
			'Message:',
			JSON.stringify(message),
		);
	}
	void socketmessages.sendEcho(message.id);

	switch (message.route) {
		case 'general':
			ongeneralmessage(message.contents);
			break;
		case 'lobby':
			SocketBus.dispatch('lobby', message.contents);
			break;
		case 'game':
			SocketBus.dispatch('game', message.contents);
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
function ongeneralmessage(message: ClientboundGeneralMessage): void {
	switch (message.action) {
		case 'notify':
			toast.show(message.value);
			break;
		case 'notifyerror':
			toast.show(message.value, { error: true });
			break;
		case 'print':
			console.log(message.value);
			break;
		case 'printerror':
			console.error(message.value);
			break;
		case 'ping':
			// Server sends this expecting a pong (echo), to verify we're still connected.
			break;
		case 'protocolversion':
			// Our code predates a protocol change. Reload to fetch the current scripts —
			// they're content-hashed, so a plain reload is guaranteed to pull the new ones.
			if (message.value !== wsutil.PROTOCOL_VERSION) location.reload();
			break;
		default:
			// @ts-ignore
			console.log(`Unknown server action "${message.action}" in general route.`);
			break;
	}
}

// Exports --------------------------------------------------------------------

export default {
	onmessage,
};
