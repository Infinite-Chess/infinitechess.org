// src/server/socket/messageRouter.ts

/**
 * This script routes incoming socket messages where they need to go.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundRoutedMessage } from '../../shared/serverbound.js';

import gamerouter from '../game/gamemanager/gamerouter.js';
import lobbyrouter from '../game/seeksmanager/lobbyrouter.js';
import { routeGeneralMessage } from './generalRouter.js';

// Functions ---------------------------------------------------------------------------

/** Routes a validated socket message to the handler for its route. */
function routeIncomingSocketMessage(ws: CustomWebSocket, message: ServerboundRoutedMessage): void {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			routeGeneralMessage(ws, message.contents);
			break;
		case 'lobby':
			lobbyrouter.route(ws, message.contents);
			break;
		case 'game':
			gamerouter.route(ws, message.contents);
			break;
		default:
			console.error('UNKNOWN web socket route received!', message satisfies never);
	}
}

export { routeIncomingSocketMessage };
