// src/server/socket/socketRouter.ts

/**
 * This script receives routes incoming socket messages them where they need to go.
 *
 * It also handles subbing to subscription lists.
 */

import type { CustomWebSocket } from './socketUtility.js';
import type { ServerboundRoutedMessage } from '../../shared/serverbound.js';

import { routeGameMessage } from '../game/gamemanager/gamerouter.js';
import { routeLobbyMessage } from '../game/seeksmanager/lobbyrouter.js';
import { routeGeneralMessage } from './generalrouter.js';

// Functions ---------------------------------------------------------------------------

function routeIncomingSocketMessage(ws: CustomWebSocket, message: ServerboundRoutedMessage): void {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			routeGeneralMessage(ws, message.contents);
			break;
		case 'lobby':
			routeLobbyMessage(ws, message.contents);
			break;
		case 'game':
			routeGameMessage(ws, message.contents);
			break;
		default:
			console.error('UNKNOWN web socket route received!', message satisfies never);
	}
}

export { routeIncomingSocketMessage };
