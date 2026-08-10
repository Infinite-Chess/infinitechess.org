// src/server/socket/generalrouter.ts

/**
 * This script handles the incoming general websocket message route.
 */

import type { CustomWebSocket } from './socketUtility.js';
import type { ClientGeneralMessage, ValidUnsub } from '../../shared/wsmessages.js';

import { subToLobby, unsubFromLobby } from '../game/seeksmanager/lobbymanager.js';
import {
	unsubSocketParticipantFromGame,
	unsubSocketSpectatorFromGame,
} from '../game/gamemanager/gamemanager.js';

// Functions -------------------------------------------------------------------

// Route for this incoming message is "general". What is their action?
function routeGeneralMessage(ws: CustomWebSocket, message: ClientGeneralMessage): void {
	// data: { route, action, value, id }
	// Route them according to their action
	switch (message.action) {
		case 'sub':
			handleSubbing(ws, message.value);
			break;
		case 'unsub':
			handleUnsubbing(ws, message.value, false);
			break;
		default:
			console.error(
				// @ts-ignore
				`UNKNOWN web socket action received in general route! "${message.action}"`,
			);
	}
}

// Actions -------------------------------------------------------------------

function handleSubbing(ws: CustomWebSocket, value: 'lobby'): void {
	// What are they wanting to subscribe to for updates?
	switch (value) {
		case 'lobby':
			subToLobby(ws);
			break;
		default:
			console.error(`UNKNOWN subscription list to subscribe client to! "${value}"`);
	}
}

// Set involuntary to true if you don't immediately want to disconnect them, but say after 5 seconds

/**
 * Unsubscribes a socket from a subscription list.
 * Entry points: Socket closure, or the client explicitly requested to unsub.
 */
function handleUnsubbing(ws: CustomWebSocket, key: ValidUnsub, involuntary: boolean): void {
	// What are they wanting to unsubscribe from updates from?
	switch (key) {
		case 'lobby':
			unsubFromLobby(ws, involuntary);
			break;
		case 'game':
			unsubSocketParticipantFromGame(ws, involuntary);
			break;
		case 'spectating':
			// Read-only spectator: no cushion/auto-resign, just detach.
			unsubSocketSpectatorFromGame(ws);
			break;
		default:
			console.error(`UNKNOWN subscription list to unsubscribe client from! "${key}"`);
	}
}

// Exports ------------------------------------------------------------

export { routeGeneralMessage, handleUnsubbing };
