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
import gameStateBuilder from './gameStateBuilder.js';

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
			// Participant path: attach, then send the current rematch state.
			gameManager.subscribeParticipant(game, ws, ourRole);
			const value = gameStateBuilder.getRematchOfferInfo(game, ourRole)!; // Guaranteed because above we confirm the game is over
			socketsend.send(ws, 'game', 'rematchstate', value);
		} else {
			// Spectator path: attach, but send no rematch state (they only
			// stay connected for the 'rematchstarted' message when a rematch is agreed).
			gameSockets.attachSpectator(game, ws);
		}
	} else {
		// Dead game
		// Client should already have seen the finalized conclusion (otherwise they wouldn't
		// be requesting to 'subscriberematch'). Tell them they're detached, they should then
		// reset rematch offer state and disable the button.
		socketsend.send(ws, 'game', 'detached', undefined);
	}
}

// Exports ---------------------------------------------------------------------

export default { subscribeToRematch };
