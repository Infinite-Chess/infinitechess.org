// src/server/game/gamemanager/abortresigngame.ts

/**
 * This script handles the abortings and resignations of online games
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './gameutility.js';

import moveutil from '../../../shared/chess/util/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';

import gameutility from './gameutility.js';
import { onGameConclusion } from './gamemanager.js';

//--------------------------------------------------------------------------------------------------------

/** Called when a client tries to abort a game. */
function abortGame(servergame: ServerGame): void {
	// Is it legal?...

	if (gameutility.isGameOver(servergame)) {
		// Return if game is already over
		console.log(
			`Player tried to abort game ${servergame.match.id} when the game is already over!`,
		);
		return;
	} else if (gameutility.isGameBorderlineResignable(servergame)) {
		// A player might try to abort a game after his opponent has just played the second move due to latency issues...
		// In doubt, be lenient and allow him to abort here. DO NOT RETURN
		console.log(
			`Player tried to abort game ${servergame.match.id} when there's been exactly 2 moves played! Aborting game anyways...`,
		);
	} else if (moveutil.isGameResignable(servergame)) {
		// Return if player tries to abort when he does not have the right
		console.error(
			`Player tried to abort game ${servergame.match.id} when there's been at least 3 moves played!`,
		);
		return;
	}

	// Abort
	onGameConclusion(servergame, { condition: 'aborted' });
}

/**
 * Called when a client tries to resign a game.
 * @param servergame - The game they are in.
 * @param ourRole - The color the socket is playing as.
 */
function resignGame(servergame: ServerGame, ourRole: Player): void {
	// Is it legal?...

	if (gameutility.isGameOver(servergame)) {
		// Return if game is already over
		console.log(
			`Player resign to resign game ${servergame.match.id} when the game is already over!`,
		);
		return;
	} else if (!moveutil.isGameResignable(servergame)) {
		// Return if player tries to resign when he does not have the right
		console.error(
			`Player tried to resign game ${servergame.match.id} when there's less than 2 moves played! Ignoring..`,
		);
		return;
	}

	// Resign
	const opponentColor = typeutil.invertPlayer(ourRole);
	onGameConclusion(servergame, { victor: opponentColor, condition: 'resignation' });
}

/**
 * Called when a client reports that the engine opponent resigned.
 * Aborts the game instead if too few moves have been played for it to be resignable.
 */
function resignEngine(servergame: ServerGame): void {
	const engineParticipant = servergame.match.engineParticipant;
	if (!engineParticipant) return; // Not an engine game

	if (moveutil.isGameResignable(servergame)) resignGame(servergame, engineParticipant.color);
	else abortGame(servergame);
}

export { abortGame, resignGame, resignEngine };
