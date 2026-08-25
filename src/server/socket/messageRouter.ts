// src/server/socket/messageRouter.ts

/**
 * This script routes incoming socket messages where they need to go.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundRoutedMessage } from '../../shared/transport/serverbound.js';

import gamerouter from '../game/gamemanager/gamerouter.js';
import lobbyrouter from '../game/seeksmanager/lobbyrouter.js';
import generalRouter from './generalRouter.js';

/** Routes a validated socket message to the handler for its route. */
function routeIncomingSocketMessage(ws: CustomWebSocket, message: ServerboundRoutedMessage): void {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			generalRouter.routeGeneralMessage(ws, message.contents);
			break;
		case 'lobby':
			lobbyrouter.routeLobbyMessage(ws, message.contents);
			break;
		case 'game':
			gamerouter.routeGameMessage(ws, message.contents);
			break;
		default:
			console.error('UNKNOWN web socket route received!', message satisfies never);
	}
}

// Exports ------------------------------------------------------------------------------------

export default { routeIncomingSocketMessage };
