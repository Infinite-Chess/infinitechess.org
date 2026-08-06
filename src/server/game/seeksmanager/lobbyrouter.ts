// src/server/game/seeksmanager/lobbyrouter.ts

/*
 * This script routes all incoming websocket messages
 * with the "lobby" route to where they need to go.
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import {
	SeekIdSchema,
	CreateSeekMessageSchema,
	CreateEngineGameMessageSchema,
} from '../../../shared/types.js';

import { createSeek } from './createseek.js';
import { cancelSeek } from './cancelseek.js';
import { acceptSeek } from './acceptseek.js';
import { createEngineGameWs } from './createenginegame.js';

const LobbySchema = z.discriminatedUnion('action', [
	z.strictObject({ action: z.literal('createseek'), value: CreateSeekMessageSchema }),
	z.strictObject({ action: z.literal('cancelseek'), value: SeekIdSchema }),
	z.strictObject({ action: z.literal('acceptseek'), value: SeekIdSchema }),
	z.strictObject({ action: z.literal('createengine'), value: CreateEngineGameMessageSchema }),
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
		case 'createengine':
			createEngineGameWs(ws, contents.value);
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
