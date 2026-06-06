// src/server/game/seeksmanager/lobbyrouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "lobby" route to where they need to go.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import { createSeek, createseekschem } from './createseek.js';
import { cancelSeek, cancelseekschem } from './cancelseek.js';
import { acceptSeek, acceptseekschem } from './acceptseek.js';

const LobbySchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('createseek'), value: createseekschem }),
	z.strictObject({ action: z.literal('cancelseek'), value: cancelseekschem }),
	z.strictObject({ action: z.literal('acceptseek'), value: acceptseekschem }),
]);
type LobbyMessage = z.infer<typeof LobbySchema>;

/**
 * Routes all incoming websocket messages related to the lobby.
 * @param ws
 * @param contents
 * @returns
 */
function routeLobbyMessage(ws: CustomWebSocket, contents: LobbyMessage): void {
	// data: { route, action, value, id }
	// Route them according to their action
	switch (contents.action) {
		case 'createseek':
			createSeek(ws, contents.value);
			break;
		case 'cancelseek':
			cancelSeek(ws, contents.value);
			break;
		case 'acceptseek':
			acceptSeek(ws, contents.value);
			break;
		default:
			console.error(
				// @ts-ignore
				`UNKNOWN web socket action received in lobby route! "${contents.action}"`,
			);
	}
}

export { routeLobbyMessage, LobbySchema };

export type {};
