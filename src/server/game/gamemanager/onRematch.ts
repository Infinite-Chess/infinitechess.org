// src/server/game/gamemanager/onRematch.ts

/**
 * This script contains the route for offering a rematch after a game concludes.
 *
 * Each player independently offers; once BOTH have offered, a rematch game is
 * created (same variant/time/rated, colors swapped).
 */

import type { ServerGame } from './gameutility.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import { createRematchGame } from './gamemanager.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client offers a rematch of a concluded game. Relays the offer to the
 * opponent, or — if the opponent has already offered — creates the rematch game.
 * @param ws - The socket
 * @param servergame - The game they are in.
 */
function offerRematch(ws: CustomWebSocket, servergame: ServerGame): void {
	if (!gameutility.isGameOver(servergame))
		return console.error('Client offered a rematch when the game is not over. Ignoring.');

	const match = servergame.match;
	const color = gameutility.getSocketRoleInGame(servergame, ws)!;
	const opponentColor = typeutil.invertPlayer(color);

	if (match.rematchOffers.has(color)) return; // Duplicate offer (e.g. after a refresh) — ignore.
	match.rematchOffers.add(color);

	// If the opponent is gone, we can't inform them. This can happen
	// if they disconnect at the same time as the rematch offer is sent.
	if (match.playerData[opponentColor]?.socket === undefined) return;

	if (match.rematchOffers.has(opponentColor)) {
		// Both players have offered — start the rematch!
		createRematchGame(servergame);
	} else {
		// Relay the offer to the opponent (their rematch button starts glowing).
		gameutility.sendMessageToSocketOfColor(match, opponentColor, 'game', 'rematchoffer');
	}
}

//--------------------------------------------------------------------------------------------------------

export { offerRematch };
