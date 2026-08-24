// src/server/socket/generalRouter.ts

/**
 * This script handles the incoming general websocket message route.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundGeneralMessage } from '../../shared/serverbound.js';

import socketSubs from './socketSubs.js';

// Functions ----------------------------------------------------------------------------------

/** Routes a validated 'general' message to the handler for its action. */
export function routeGeneralMessage(ws: CustomWebSocket, message: ServerboundGeneralMessage): void {
	// Route them according to their action
	switch (message.action) {
		case 'sub':
			socketSubs.sub(ws, message.value);
			break;
		case 'unsub':
			socketSubs.unsub(ws, message.value, false);
			break;
		default:
			console.error('UNKNOWN web socket action received in general route!', message satisfies never); // prettier-ignore
	}
}
