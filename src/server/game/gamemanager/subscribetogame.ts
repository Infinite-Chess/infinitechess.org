// src/server/game/gamemanager/subscribetogame.ts

/**
 * Handles the new `subscribe` game-route action: a client (whether participant or spectator)
 * subscribes to a live game *by id* and receives its full live state (`gamestate`).
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import gameutility from './gameutility.js';
import { getGameByID } from './gamemanager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { runReconnectSideEffects } from './joingame.js';

/**
 * Fires when a client sends the 'subscribe' action with a game id,
 * to attach to a live game and receive its full state.
 * @param ws - Their websocket
 * @param gameId - The id of the game they requested to subscribe to
 */
function onSubscribeToGame(ws: CustomWebSocket, gameId: number): void {
	const servergame = getGameByID(gameId);
	if (servergame === undefined) {
		// Not a live game — it may be concluded (served over HTTP) or nonexistent.
		sendSocketMessage(ws, 'game', 'nogame');
		return;
	}

	const color = gameutility.getSocketRoleInGame(servergame, ws);

	if (color === undefined) {
		// Spectator path (not a participant): send the role-agnostic
		// state (no youAreColor/participantState overlay), then attach.
		try {
			const value = gameutility.produceFullGameState(servergame);
			servergame.spectators.add(ws);
			ws.metadata.subscriptions.spectating = { id: gameId };
			sendSocketMessage(ws, 'game', 'gamestate', value);
		} catch {
			// DB error (already logged)
			sendSocketMessage(
				ws,
				'game',
				'notifyerror',
				"Couldn't connect to game. A server error occurred. Please refresh.",
			);
		}
	} else {
		// Participant path: attach without the old joingame payload, then send the new state.
		gameutility.subscribeClientToGame(servergame, ws, color, { sendGameInfo: false });
		try {
			gameutility.sendParticipantGameState(servergame, ws, color);
		} catch {
			// DB error (already logged)
			sendSocketMessage(
				ws,
				'game',
				'notifyerror',
				"Couldn't connect to game. A server error occurred. Please refresh.",
			);
			return;
		}

		runReconnectSideEffects(servergame, color);
	}
}

export { onSubscribeToGame };
