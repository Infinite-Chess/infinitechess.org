// src/server/game/gamemanager/onSubscribe.ts

/**
 * Handles the `subscribe` game-route action: a client (participant or spectator) attaches to a live
 * game *by id* and receives its current live state (`gamestate`). Serves both a fresh page load and
 * a live reconnect — the client builds the board from scratch on load, or reconciles its existing
 * board against the returned state on reconnect. (Finalized-game reconnects use `subscriberematch` instead)
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';

import socketsend from '../../socket/socketSend.js';
import gamemanager from './gamemanager.js';
import gamesockets from './gamesockets.js';
import activegames from './activegames.js';
import gamestatebuilder from './gamestatebuilder.js';

/**
 * Fires when a client sends the 'subscribe' action with a game id, to attach to a live game and
 * receive its current state. Also the live-reconnect path (the socket reopened mid-game).
 */
export function subscribeToGame(ws: CustomWebSocket, game_id: number): void {
	const game = activegames.getByID(game_id);
	if (game !== undefined) {
		// Live game
		const ourRole = gamesockets.getRole(game, ws);
		if (ourRole !== undefined) {
			// Participant path: attach, then send the current state.
			const { evicted } = gamemanager.subscribeParticipant(game, ws, ourRole);
			// A takeover kicks the previous tab, terminating its engine worker mid-search. It can
			// never finish that search, so rewind the engine's turn before this client resumes it.
			if (evicted) gamemanager.freezeEngineClock(game);
			gamemanager.resumeEngineClock(game);
			const gameStateMessage = gamestatebuilder.buildStateMessage(game, ourRole, false);
			socketsend.send(ws, 'game', 'gamestate', gameStateMessage);
		} else {
			// Spectator path: attach, then send the role-agnostic state (no participantState overlay).
			gamesockets.attachSpectator(game, ws);
			const gameStateBaseMessage = gamestatebuilder.buildStateBase(game);
			socketsend.send(ws, 'game', 'gamestate', gameStateBaseMessage);
		}
	} else {
		// The game isn't live in server memory (concluded + evicted, or never existed). The client
		// requested a full `subscribe`, so it may not yet have seen the conclusion — tell it to reload
		// (`notlive`). Fresh SSR then serves the dead review page (if logged) or the 404 page, and a
		// review client fetches the dead state over HTTP.
		socketsend.send(ws, 'game', 'notlive', undefined);
	}
}
