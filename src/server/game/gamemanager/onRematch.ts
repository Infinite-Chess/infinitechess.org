// src/server/game/gamemanager/onRematch.ts

/**
 * This script contains the route for offering a rematch after a game concludes.
 *
 * Each player independently offers; once BOTH have offered, a rematch game is
 * created (same variant/time/rated/modifiers, colors swapped). Engine games skip the
 * handshake — an engine always accepts, so the human's offer starts it outright.
 */

import type { AuthMemberInfo } from '../../types.js';
import type { CustomWebSocket } from '../../socket/socketTypes.js';
import type { Player, PlayerGroup } from '../../../shared/util/typeutil.js';
import type { GameSetup, ServerGame } from './servergametypes.js';

import typeutil from '../../../shared/util/typeutil.js';

import manifest from '../../config/manifest.js';
import socketsend from '../../socket/socketSend.js';
import gamemanager from './gamemanager.js';
import gamesockets from './gamesockets.js';
import gameutility from './gameutility.js';
import activeplayers from './activeplayers.js';
import gamelifecycle from './gamelifecycle.js';

// Functions ----------------------------------------------------------------------------------

/**
 * Called when a client offers a rematch of a concluded game. Relays the offer to the
 * opponent, or — if the opponent has already offered — creates the rematch game.
 */
export function offerRematch(servergame: ServerGame, ourRole: Player): void {
	if (!gameutility.isGameOver(servergame))
		return console.error('Client offered a rematch when the game is not over. Ignoring.');

	// There's no engine to await an acceptance from — start the rematch immediately.
	if (gameutility.isEngineGame(servergame)) return createRematchGame(servergame);

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
		gamesockets.sendToColor(match, opponentColor, 'game', 'rematchoffer', undefined);
	}
}

/**
 * Creates a rematch of a concluded game: same variant/time/rated (and same engine/difficulty,
 * if any), participants swapped to the opposite colors. Tears down the old game, starts the
 * fresh one, and navigates all still-connected players to it. Silently aborts if either player
 * is already in another game.
 * @param oldGame - The concluded game a rematch has been agreed upon for.
 */
function createRematchGame(oldGame: ServerGame): void {
	const oldMatch = oldGame.match;

	// A rematch can't start if either player has meanwhile joined a DIFFERENT game. A concluded
	// game frees its players from the active-players list, so a lingering participant reads as
	// `undefined` here; only a genuine new game they've joined (a different id) blocks the rematch.
	for (const data of Object.values(oldMatch.playerData)) {
		const inGameID = activeplayers.getGameID(data.identifier);
		if (inGameID !== undefined && inGameID !== oldMatch.id) return; // Buttons just stay disabled.
	}

	// Capture identities (swapped colors) and connected sockets before tearing down the old game.
	const swapped: PlayerGroup<{ identifier: AuthMemberInfo; socket?: CustomWebSocket }> = {};
	/** Everyone taken into the rematch, each with the color they play it as (spectators: none). */
	const toNavigate: { socket: CustomWebSocket; role?: Player }[] = [];
	for (const [c, data] of Object.entries(oldMatch.playerData)) {
		const newColor = typeutil.invertPlayer(Number(c) as Player);
		swapped[newColor] = {
			identifier: data.identifier,
			socket: data.socket,
		};
		if (data.socket) toNavigate.push({ socket: data.socket, role: newColor });
	}
	// Also notify spectators of the rematch
	for (const socket of oldGame.spectators) toNavigate.push({ socket });

	const setup: GameSetup = {
		variant: oldMatch.variant,
		time: oldMatch.clock,
		rated: oldMatch.rated,
		modifiers: oldMatch.modifiers, // A rematch inherits the original game's modifiers.
		// The version is re-seeded rather than carried over — an engine update could have
		// landed mid-game, in which case the old game's version is no longer what we'd serve.
		...(oldMatch.engineParticipant && {
			engineParticipant: {
				...oldMatch.engineParticipant,
				color: typeutil.invertPlayer(oldMatch.engineParticipant.color),
				version: manifest.getEngineVersion(),
			},
		}),
	};

	gamelifecycle.evict(oldGame); // Removes the old game from memory (and unsubscribes its sockets).

	let newGameID: number;
	try {
		newGameID = gamemanager.createGame(setup, swapped);
	} catch (error: unknown) {
		// The old game is already evicted, so there's nothing left to navigate anyone back to.
		gamemanager.onGameCreationError(
			error,
			toNavigate.map((n) => n.socket),
		);
		return;
	}

	// Alert all connected players of the new game (they auto navigate)
	for (const { socket, role } of toNavigate)
		socketsend.send(socket, 'game', 'ingame', { id: newGameID, role });
}
