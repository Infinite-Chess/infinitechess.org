// src/server/game/gamemanager/onSubscribe.ts

/**
 * Handles the `subscribe` game-route action: a client (participant or spectator) attaches to a live
 * game *by id* and receives its current live state (`gamestate`). Serves both a fresh page load and
 * a live reconnect — the client builds the board from scratch on load, or reconciles its existing
 * board against the returned state on reconnect. (Finalized-game reconnects use `subscriberematch` instead)
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import gameutility from './gameutility.js';
import { getGameByID } from './gamemanager.js';
import { getGameData } from '../../database/gamesManager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';

/**
 * Fires when a client sends the 'subscribe' action with a game id, to attach to a live game and
 * receive its current state. Also the live-reconnect path (the socket reopened mid-game).
 */
function onSubscribeToGame(ws: CustomWebSocket, game_id: number): void {
	const game = getGameByID(game_id);
	if (game !== undefined) {
		// Live game
		const ourRole = gameutility.getSocketRoleInGame(game, ws);
		if (ourRole !== undefined) {
			// Participant path: attach, then send the current state.
			gameutility.subscribeClientToGame(game, ws, ourRole);
			gameutility.sendParticipantGameState(game, ws, ourRole);
		} else {
			// Spectator path: attach, then send the role-agnostic state (no participantState overlay).
			gameutility.subscribeSpectatorToGame(game, ws);
			gameutility.sendSpectatorGameState(game, ws);
		}
	} else {
		// Dead game
		/*
		 * Handles a request to subscribe to a game, but its dead (not in server memory).
		 * Tells the client to unsub or that there's no game.
		 *
		 * A game absent from the DB was aborted before any move (never logged), so we tell
		 * the client to refresh (`nogame`).
		 *
		 * TODO (T10): If the game is present in the DB, decide whether to send the state
		 * directly or tell it to use the HTTP endpoint.
		 */
		let loggedInDb: boolean;
		try {
			loggedInDb = !!getGameData(game_id, ['game_id']);
		} catch {
			// DB error (already logged)
			sendSocketMessage(
				ws,
				'game',
				'notifyerror',
				'A server error occurred while connecting to the game. Please refresh.',
			);
			return;
		}

		sendSocketMessage(ws, 'game', loggedInDb ? 'unsub' : 'nogame');
	}
}

export { onSubscribeToGame };
