// src/server/game/seeksmanager/lobbyrouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "lobby" route to where they need to go.
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { ServerboundLobbyMessage } from '../../../shared/serverbound.js';

import { createSeek } from './createseek.js';
import { cancelSeek } from './cancelseek.js';
import { acceptSeek } from './acceptseek.js';
import { createEngineGame } from './createenginegame.js';

/** Routes all incoming websocket messages related to the lobby. */
async function routeLobbyMessage(
	ws: CustomWebSocket,
	contents: ServerboundLobbyMessage,
): Promise<void> {
	// Route them according to their action
	switch (contents.action) {
		case 'createseek':
			await createSeek(ws, contents.value);
			break;
		case 'cancelseek':
			cancelSeek(ws, contents.value);
			break;
		case 'acceptseek':
			acceptSeek(ws, contents.value);
			break;
		case 'createengine':
			createEngineGame(ws, contents.value);
			break;
		default:
			console.error('UNKNOWN web socket action received in lobby route!', contents satisfies never); // prettier-ignore
	}
}

export { routeLobbyMessage };
