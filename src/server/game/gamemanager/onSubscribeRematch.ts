// src/server/game/gamemanager/onSubscribeRematch.ts

/**
 * Handles the `subscriberematch` reconnect — a lean reconnect for a game the
 * client already knows is finalized: its result is locked in, so only rematch-offer
 * state can change. Unfinalized reconnects instead go through `subscribe` (see onSubscribe.ts).
 */

import type { CustomWebSocket } from '../../socket/socketUtility.js';

import gameutility from './gameutility.js';
import { getGameByID } from './gamemanager.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';

/**
 * A lean reconnect for a game the client already knows is finalized:
 * its result is locked in, so only rematch-offer state can still change.
 */
function onSubscribeToRematch(ws: CustomWebSocket, game_id: number): void {
	const game = getGameByID(game_id);

	if (game !== undefined) {
		// Live game
		if (!gameutility.isGameOver(game)) {
			// Only concluded games have a rematch state
			console.error(`Client requested a rematch subscription for a game that is not over (game_id ${game_id}).`); // prettier-ignore
			return;
		}
		const ourRole = gameutility.getSocketRoleInGame(game, ws);
		if (ourRole !== undefined) {
			// Participant path: attach, then send the current rematch state.
			gameutility.subscribeClientToGame(game, ws, ourRole);
			const value = gameutility.getRematchOfferInfo(game, ourRole)!; // Guaranteed because above we confirm the game is over
			sendSocketMessage(ws, 'game', 'rematchstate', value);
		} else {
			// Spectator path: attach, but send no rematch state (they only
			// stay connected for the 'ingame' message when a rematch is agreed).
			gameutility.subscribeSpectatorToGame(game, ws);
		}
	} else {
		// Dead game
		// Client should already have seen the finalized conclusion (otherwise they wouldn't
		// be requesting to 'subscriberematch'). Tell them to unsub, they should then reset
		// rematch offer state and disable the button.
		sendSocketMessage(ws, 'game', 'unsub', undefined);
	}
}

export { onSubscribeToRematch };
