// src/server/socket/socketRouter.ts

/**
 * This script receives routes incoming socket messages them where they need to go.
 *
 *
 * It also handles subbing to subscription lists.
 */

import type { CustomWebSocket } from './socketUtility.js';
import type { WebsocketInMessage } from './receiveSocketMessage.js';

import { routeGameMessage } from '../game/gamemanager/gamerouter.js';
import { routeGeneralMessage } from './generalrouter.js';
import { routeInvitesMessage } from '../game/invitesmanager/invitesrouter.js';

// Functions ---------------------------------------------------------------------------

function routeIncomingSocketMessage(ws: CustomWebSocket, message: WebsocketInMessage): void {
	// Route them to their specified location
	switch (message.route) {
		case 'general':
			routeGeneralMessage(ws, message.contents);
			break;
		case 'invites':
			routeInvitesMessage(ws, message.contents, message.id);
			break;
		case 'game':
			routeGameMessage(ws, message.contents, message.id);
			break;
		default:
			// @ts-ignore
			console.error(`UNKNOWN web socket route received! "${message.route}"`);
	}
}

export { routeIncomingSocketMessage };

export type { WebsocketInMessage };
