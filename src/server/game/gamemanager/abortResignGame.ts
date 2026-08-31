// src/server/game/gamemanager/abortResignGame.ts

/**
 * Handles the `abort`, `resign` and `engineresign` game actions: a player ending a live
 * game of their own accord, once the number of moves played says they may.
 *
 * Legality checks only — the ending itself is `gameLifecycle.ts`'s conclude().
 * Ending a game against an absent opponent lives in `claimDisconnect.ts`.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './serverGameTypes.js';

import moveutil from '../../../shared/chess/logic/moveutil.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';

import gameUtility from './gameUtility.js';
import gameLifecycle from './gameLifecycle.js';

// Functions -------------------------------------------------------------------

/** Called when a client tries to abort a game. */
function abort(servergame: ServerGame): void {
	// Is it legal?...

	if (gamefileutility.isGameOver(servergame)) {
		// Return if game is already over
		console.log(`Player tried to abort game ${servergame.match.id} when the game is already over!`); // prettier-ignore
		return;
	} else if (gameUtility.isGameBorderlineResignable(servergame)) {
		// A player might try to abort a game after his opponent has just played the second move due to latency issues...
		// In doubt, be lenient and allow him to abort here. DO NOT RETURN
		console.log(`Player tried to abort game ${servergame.match.id} when there's been exactly 2 moves played! Aborting game anyways...`); // prettier-ignore
	} else if (moveutil.isGameResignable(servergame)) {
		// Return if player tries to abort when he does not have the right
		console.error(`Player tried to abort game ${servergame.match.id} when there's been at least 3 moves played!`); // prettier-ignore
		return;
	}

	// Abort
	gameLifecycle.conclude(servergame, { condition: 'aborted' });
}

/** Called when a client tries to resign a game. */
function resign(servergame: ServerGame, ourRole: Player): void {
	// Is it legal?...

	if (gamefileutility.isGameOver(servergame)) {
		// Return if game is already over
		console.log(`Player tried to resign game ${servergame.match.id} when the game is already over!`); // prettier-ignore
		return;
	} else if (!moveutil.isGameResignable(servergame)) {
		// Return if player tries to resign when he does not have the right
		console.error(`Player tried to resign game ${servergame.match.id} when there's less than 2 moves played! Ignoring..`); // prettier-ignore
		return;
	}

	// Resign
	const opponentColor = typeutil.invertPlayer(ourRole);
	gameLifecycle.conclude(servergame, { victor: opponentColor, condition: 'resignation' });
}

/**
 * Called when a client reports that the engine opponent resigned.
 * Aborts the game instead if too few moves have been played for it to be resignable.
 */
function resignEngine(servergame: ServerGame): void {
	const engineParticipant = servergame.match.engineParticipant;
	if (!engineParticipant) return; // Not an engine game

	if (moveutil.isGameResignable(servergame)) resign(servergame, engineParticipant.color);
	else abort(servergame);
}

// Exports ---------------------------------------------------------------------

export default {
	abort,
	resign,
	resignEngine,
};
