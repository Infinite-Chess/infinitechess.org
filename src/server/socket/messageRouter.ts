// src/server/socket/messageRouter.ts

/**
 * This script routes incoming socket messages where they need to go.
 */

import type { CustomWebSocket } from './socketTypes.js';
import type { ServerboundRoutedMessage } from '../../shared/serverbound.js';

import { routeGameMessage } from '../game/gamemanager/gamerouter.js';
import { routeLobbyMessage } from '../game/seeksmanager/lobbyrouter.js';
import { routeGeneralMessage } from './generalRouter.js';

// Functions ---------------------------------------------------------------------------

/** Awaited so the caller's ack isn't sent until the message has actually been handled. */
async function routeIncomingSocketMessage(
	ws: CustomWebSocket,
	message: ServerboundRoutedMessage,
): Promise<void> {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			routeGeneralMessage(ws, message.contents);
			break;
		case 'lobby':
			await routeLobbyMessage(ws, message.contents);
			break;
		case 'game':
			routeGameMessage(ws, message.contents);
			break;
		default:
			console.error('UNKNOWN web socket route received!', message satisfies never);
	}
}

export { routeIncomingSocketMessage };
