// src/client/scripts/esm/socket/socketreceive.ts

/**
 * Entry point for every incoming server message: validates it against the clientbound
 * contract at the trust boundary, feeds the heartbeat watchdog, echoes it back, then
 * dispatches it onto the SocketBus for its route's handlers to pick up.
 *
 * Counterpart of the server's socketReceive.
 */

import type { ClientboundGeneralMessage } from '../../../../shared/transport/clientbound.js';

import * as z from 'zod';

import socketutil from '../../../../shared/util/socketutil.js';
import { ClientboundSchema } from '../../../../shared/transport/clientbound.js';

import toast from '../components/toast.js';
import socketsend from './socketsend.js';
import socketlogger from './socketlogger.js';
import { SocketBus } from './SocketBus.js';
import socketintents from './socketintents.js';

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
	socketsend.rescheduleHeartbeatTimer();

	const zod_result = ClientboundSchema.safeParse(parsedUnvalidatedMessage);
	if (!zod_result.success) {
		console.error('Received malformed websocket message from the server:', parsedUnvalidatedMessage); // prettier-ignore
		console.error('Error:', z.prettifyError(zod_result.error));
		// Don't echo, accept that the server's echo timer may close the socket.
		// We can't even know whether this message is something we SHOULD echo.
		return;
	}

	// Validation was a success! Message contains valid parameters.

	const message = zod_result.data;

	socketlogger.logIncoming(message);

	// Receipts are never echoed back.
	if (message.route === 'echo') return socketsend.cancelTimerOfMessageID(message.contents);
	// The action we asked about is no longer outstanding.
	if (message.route === 'ack') return socketintents.onAck(message.contents);

	// Not a receipt...

	void socketsend.sendEcho(message.id);

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
			console.error('Unknown socket route received from the server!', message satisfies never); // prettier-ignore
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
			if (message.value !== socketutil.PROTOCOL_VERSION) location.reload();
			break;
		default:
			console.error('Unknown server action in general route.', message satisfies never);
	}
}

// Exports --------------------------------------------------------------------

export default {
	onmessage,
};
