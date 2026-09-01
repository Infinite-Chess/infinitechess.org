// src/server/game/seeksmanager/lobbyRouter.ts

/**
 * Routes every incoming websocket message on the "lobby" route to its handler.
 *
 * See docs/systems/WEBSOCKETS.md.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundLobbyMessage } from '../../../shared/transport/serverbound.js';

import createSeek from './createSeek.js';
import cancelSeek from './cancelSeek.js';
import acceptSeek from './acceptSeek.js';
import createEngineGame from './createEngineGame.js';

/** Routes all incoming websocket messages related to the lobby. */
function route(ws: CustomWebSocket, contents: ServerboundLobbyMessage): void {
	// Route them according to their action
	switch (contents.action) {
		case 'createseek':
			createSeek.create(ws, contents.value);
			break;
		case 'cancelseek':
			cancelSeek.cancel(ws, contents.value);
			break;
		case 'acceptseek':
			acceptSeek.accept(ws, contents.value);
			break;
		case 'createenginegame':
			createEngineGame.create(ws, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in lobby route!', contents satisfies never); // prettier-ignore
	}
}

// Exports ---------------------------------------------------------------------

export default { route };
