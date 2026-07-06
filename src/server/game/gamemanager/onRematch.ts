// src/server/game/gamemanager/onRematch.ts

/**
 * This script contains the route for offering a rematch after a game concludes.
 *
 * Each player independently offers; once BOTH have offered, a rematch game is
 * created (same variant/time/rated, colors swapped).
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { GameSetup, ServerGame } from './gameutility.js';

import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import { createGame, evictGame } from './gamemanager.js';
import { getIDOfGamePlayerIsIn } from './activeplayers.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client offers a rematch of a concluded game. Relays the offer to the
 * opponent, or — if the opponent has already offered — creates the rematch game.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function offerRematch(servergame: ServerGame, ourRole: Player): void {
	if (!gameutility.isGameOver(servergame))
		return console.error('Client offered a rematch when the game is not over. Ignoring.');

	const match = servergame.match;
	const opponentColor = typeutil.invertPlayer(ourRole);

	if (match.rematchOffers.has(ourRole)) return; // Duplicate offer (e.g. after a refresh) — ignore.
	match.rematchOffers.add(ourRole);

	// If the opponent is gone, we can't inform them. This can happen
	// if they disconnect at the same time as the rematch offer is sent.
	if (match.playerData[opponentColor]!.socket === undefined) return;

	if (match.rematchOffers.has(opponentColor)) {
		// Both players have offered — start the rematch!
		createRematchGame(servergame);
	} else {
		// Relay the offer to the opponent (their rematch button starts glowing).
		gameutility.sendMessageToColor(match, opponentColor, 'game', 'rematchoffer');
	}
}

/**
 * Creates a rematch of a concluded game: same variant/time/rated, players swapped to the
 * opposite colors. Tears down the old game, starts the fresh one, and navigates both still-
 * connected players to it. Silently aborts if either player is already in another game.
 * @param oldGame - The concluded game both players have offered a rematch of.
 */
function createRematchGame(oldGame: ServerGame): void {
	const oldMatch = oldGame.match;

	// A rematch can't start if either player has meanwhile joined a DIFFERENT game. A concluded
	// game frees its players from the active-players list, so a lingering participant reads as
	// `undefined` here; only a genuine new game they've joined (a different id) blocks the rematch.
	for (const data of Object.values(oldMatch.playerData)) {
		const inGameID = getIDOfGamePlayerIsIn(data.identifier);
		if (inGameID !== undefined && inGameID !== oldMatch.id) return; // Buttons just stay disabled.
	}

	// Capture identities (swapped colors) and connected sockets before tearing down the old game.
	const swapped: PlayerGroup<{ identifier: AuthMemberInfo }> = {};
	const socketsToNavigate: CustomWebSocket[] = [];
	for (const [c, data] of Object.entries(oldMatch.playerData)) {
		swapped[typeutil.invertPlayer(Number(c) as Player)] = { identifier: data.identifier };
		if (data.socket) socketsToNavigate.push(data.socket);
	}
	// Also notify spectators of the rematch
	socketsToNavigate.push(...oldGame.spectators);

	const setup: GameSetup = {
		variant: { kind: 'preset', code: oldMatch.variant },
		time: oldMatch.clock,
		rated: oldMatch.rated,
	};

	evictGame(oldGame); // Removes the old game from memory (and unsubscribes its sockets).
	const newGameID = createGame(setup, swapped);

	// Alert all connected players of the new game (they auto navigate)
	for (const socket of socketsToNavigate) sendSocketMessage(socket, 'game', 'ingame', newGameID);
}

//--------------------------------------------------------------------------------------------------------

export { offerRematch };
