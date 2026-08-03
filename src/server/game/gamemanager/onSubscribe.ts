// src/server/game/gamemanager/onSubscribe.ts

/**
 * Handles the `subscribe` game-route action: a client (participant or spectator) attaches to a live
 * game *by id* and receives its current live state (`gamestate`). Serves both a fresh page load and
 * a live reconnect — the client builds the board from scratch on load, or reconciles its existing
 * board against the returned state on reconnect. (Finalized-game reconnects use `subscriberematch` instead)
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import gameutility from './gameutility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { getGameByID, resumeEngineClock } from './gamemanager.js';

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
			resumeEngineClock(game);
			const gameStateMessage = gameutility.getGameStateMessageContents(game, ourRole, false);
			sendSocketMessage(ws, 'game', 'gamestate', gameStateMessage);
		} else {
			// Spectator path: attach, then send the role-agnostic state (no participantState overlay).
			gameutility.subscribeSpectatorToGame(game, ws);
			const gameStateBaseMessage = gameutility.buildGameStateBase(game);
			sendSocketMessage(ws, 'game', 'gamestate', gameStateBaseMessage);
		}
	} else {
		// The game isn't live in server memory (concluded + evicted, or never existed). The client
		// requested a full `subscribe`, so it may not yet have seen the conclusion — tell it to reload
		// (`notlive`). Fresh SSR then serves the dead review page (if logged) or the 404 page, and a
		// review client fetches the dead state over HTTP.
		sendSocketMessage(ws, 'game', 'notlive');
	}
}

export { onSubscribeToGame };
