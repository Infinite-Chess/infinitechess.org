// src/server/game/gamemanager/onSubscribeRematch.ts

/**
 * Handles the `subscriberematch` reconnect — a lean reconnect for a game the
 * client already knows is finalized: its result is locked in, so only rematch-offer
 * state can change. Unfinalized reconnects instead go through `subscribe` (see onSubscribe.ts).
 */

import type { CustomWebSocket } from '../../socket/socketTypes.js';

import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import socketsend from '../../socket/socketSend.js';
import gameManager from './gameManager.js';
import gameSockets from './gameSockets.js';
import activeGames from './activeGames.js';

/**
 * A lean reconnect for a game the client already knows is finalized:
 * its result is locked in, so only rematch-offer state can still change.
 */
function subscribeToRematch(ws: CustomWebSocket, game_id: number): void {
	const game = activeGames.getByID(game_id);

	if (game !== undefined) {
		// Live game
		if (!gamefileutility.isGameOver(game)) {
			// Only concluded games have a rematch state
			console.error(`Client requested a rematch subscription for a game that is not over (game_id ${game_id}).`); // prettier-ignore
			return;
		}
		const ourRole = gameSockets.getRole(game, ws);
		if (ourRole !== undefined) {
			// Participant path: attach, then send the lean state (their rematch overlay).
			gameManager.subscribeParticipant(game, ws, ourRole);
			gameSockets.sendGameState(game, ourRole, 'lean', false);
		} else {
			// Spectator path: attach, but send no state (they only stay
			// connected for the 'rematchstarted' message when a rematch is agreed).
			gameSockets.attachSpectator(game, ws);
			gameSockets.broadcastSpectatorCount(game);
		}
	} else {
		// The game isn't live in server memory (concluded + evicted, or never existed). They
		// missed the eviction while disconnected, so their view is stale by more than the
		// rematch state — chat is appended right up to it. Reloading (`notlive`) then serves
		// them fresh SSR: the dead review page, else the 404 page.
		socketsend.send(ws, 'game', 'notlive', undefined);
	}
}

// Exports ---------------------------------------------------------------------

export default { subscribeToRematch };
