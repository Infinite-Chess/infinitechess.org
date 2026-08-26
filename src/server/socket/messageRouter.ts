// src/server/socket/messageRouter.ts

/**
 * Routes every incoming websocket message to the router for its route.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundRoutedMessage } from '../../shared/transport/serverbound.js';

import gameRouter from '../game/gamemanager/gameRouter.js';
import lobbyRouter from '../game/seeksmanager/lobbyRouter.js';
import generalRouter from './generalRouter.js';

/** Routes a validated socket message to the handler for its route. */
function routeIncomingSocketMessage(ws: CustomWebSocket, message: ServerboundRoutedMessage): void {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			generalRouter.routeGeneralMessage(ws, message.contents);
			break;
		case 'lobby':
			lobbyRouter.routeLobbyMessage(ws, message.contents);
			break;
		case 'game':
			gameRouter.routeGameMessage(ws, message.contents);
			break;
		default:
			console.error('UNKNOWN web socket route received!', message satisfies never);
	}
}

// Exports ---------------------------------------------------------------------

export default { routeIncomingSocketMessage };
