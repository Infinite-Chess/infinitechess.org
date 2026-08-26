// src/server/game/seeksmanager/lobbyrouter.ts

/**
 * Routes every incoming websocket message on the "lobby" route to its handler.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundLobbyMessage } from '../../../shared/transport/serverbound.js';

import createseek from './createseek.js';
import cancelseek from './cancelseek.js';
import acceptseek from './acceptseek.js';
import createenginegame from './createenginegame.js';

/** Routes all incoming websocket messages related to the lobby. */
function routeLobbyMessage(ws: CustomWebSocket, contents: ServerboundLobbyMessage): void {
	// Route them according to their action
	switch (contents.action) {
		case 'createseek':
			createseek.create(ws, contents.value);
			break;
		case 'cancelseek':
			cancelseek.cancel(ws, contents.value);
			break;
		case 'acceptseek':
			acceptseek.accept(ws, contents.value);
			break;
		case 'createengine':
			createenginegame.create(ws, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in lobby route!', contents satisfies never); // prettier-ignore
	}
}

// Exports ------------------------------------------------------------------------------------

export default { routeLobbyMessage };
