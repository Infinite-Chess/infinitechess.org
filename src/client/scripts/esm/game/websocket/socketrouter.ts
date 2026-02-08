// src/client/scripts/esm/game/websocket/socketrouter.ts

/**
 * Routes incoming websocket messages to the appropriate handler
 * based on the subscription type.
 */

import timeutil from '../../../../../shared/util/timeutil.js';
import { GAME_VERSION } from '../../../../../shared/game_version.js';

import toast from '../gui/toast.js';
import invites from '../misc/invites.js';
import socketman from './socketman.js';
import LocalStorage from '../../util/LocalStorage.js';
import socketmessages from './socketmessages.js';
import onlinegamerouter from '../misc/onlinegame/onlinegamerouter.js';

// Types -----------------------------------------------------------------------

type WebsocketMessageValue = MessageEvent['data'];

/** An incoming websocket server message. */
export interface WebsocketMessage {
	/** What route the message should be forwarded to (e.g. "general", "invites", "game", "echo"). */
	route: string;
	/** The message contents. For echo messages, this is the message ID being echoed.
	 * For other messages, this is an object with action and value. */
	contents: any;
	/** The ID of the message to echo, so the server knows we've received it.
	 * Only present for non-echo messages. */
	id?: number;
	/** The ID of the message this message is the reply to, if specified. */
	replyto?: number;
}

/** Information about the last hard refresh we attempted. */
type HardRefreshInfo = {
	timeLastHardRefreshed: number;
	expectedVersion: string;
	refreshFailed?: boolean;
};

// Routing ---------------------------------------------------------------------

/**
 * Called when we receive an incoming server websocket message.
 * Sends an echo to the server, then routes the message.
 * @param serverMessage - The incoming server message event.
 */
function onmessage(serverMessage: MessageEvent): void {
	let message: WebsocketMessage;
	try {
		message = JSON.parse(serverMessage.data);
	} catch (error) {
		return console.error('Error parsing incoming message as JSON:', error);
	}

	const isEcho = message.route === 'echo';

	// Any incoming message proves the connection is alive.
	// Reschedule the inactivity timer that detects silent disconnections.
	socketmessages.rescheduleInactivityTimer();

	if (socketman.isDebugEnabled()) {
		if (isEcho) {
			if (socketmessages.alsoPrintIncomingEchos)
				console.log(`Incoming message: ${JSON.stringify(message)}`);
		} else console.log(`Incoming message: ${JSON.stringify(message)}`);
	}

	if (isEcho) return socketmessages.cancelTimerOfMessageID(message.contents);

	// Not an echo...
	const route = message.route;

	// Send our echo — we always echo every message EXCEPT echos themselves
	socketmessages.send('general', 'echo', message.id);

	// Execute any on-reply function
	socketmessages.executeOnreplyFunc(message.replyto);

	switch (route) {
		case undefined: // Null message (e.g. { id, replyto }). Allows executing on-reply funcs.
			break;
		case 'general':
			ongeneralmessage(message.contents.action, message.contents.value);
			break;
		case 'invites':
			invites.onmessage(message.contents);
			break;
		case 'game':
			onlinegamerouter.routeMessage(message.contents);
			break;
		default:
			console.error('Unknown socket subscription received from the server! Message:');
			return console.log(message);
	}
}

/**
 * Handles incoming messages with route "general".
 * @param action - The action the incoming server message specified
 * @param value - The value of the incoming server message
 */
function ongeneralmessage(action: string, value: WebsocketMessageValue): void {
	switch (action) {
		case 'notify':
			toast.show(value);
			break;
		case 'notifyerror':
			toast.show(value, { error: true, durationMultiplier: 2 });
			break;
		case 'print':
			console.log(value);
			break;
		case 'printerror':
			console.error(value);
			break;
		case 'renewconnection':
			// Server sends this expecting an echo, to verify we're still connected.
			break;
		case 'gameversion':
			if (value !== GAME_VERSION) handleHardRefresh(value);
			break;
		default:
			console.log(
				`We don't know how to treat this server action in general route: Action "${action}". Value: ${value}`,
			);
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
