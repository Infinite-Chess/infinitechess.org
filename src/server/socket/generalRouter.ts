// src/server/socket/generalRouter.ts

/**
 * This script handles the incoming general websocket message route.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundGeneralMessage } from '../../shared/serverbound.js';

import { handleSubbing, handleUnsubbing } from './socketSubs.js';

// Functions -------------------------------------------------------------------

// Route for this incoming message is "general". What is their action?
function routeGeneralMessage(ws: CustomWebSocket, message: ServerboundGeneralMessage): void {
	// Route them according to their action
	switch (message.action) {
		case 'sub':
			handleSubbing(ws, message.value);
			break;
		case 'unsub':
			handleUnsubbing(ws, message.value, false);
			break;
		default:
			console.error('UNKNOWN web socket action received in general route!', message satisfies never); // prettier-ignore
	}
}

// Exports ------------------------------------------------------------

export { routeGeneralMessage };
