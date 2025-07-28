
/**
 * This script handles the abortings and resignations of online games
 */

import gameutility, { Game } from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client tries to abort a game.
 * @param ws - The websocket
 * @param game - The game they are in..
 */
function abortGame(ws: CustomWebSocket, game: Game): void {

	// Is it legal?...

	if (gameutility.isGameOver(game)) {
		// Return if game is already over
		console.log(`Player tried to abort game ${game.id} when the game is already over!`);
		return;
	} else if (gameutility.isGameBorderlineResignable(game)) {
		// A player might try to abort a game after his opponent has just played the second move due to latency issues...
		// In doubt, be lenient and allow him to abort here. DO NOT RETURN
		console.log(`Player tried to abort game ${game.id} when there's been exactly 2 moves played! Aborting game anyways...`);
	} else if (gameutility.isGameResignable(game)) {
		// Return if player tries to abort when he does not have the right
		console.error(`Player tried to abort game ${game.id} when there's been at least 3 moves played!`);
		return;
	}

	// Abort
	setGameConclusion(game, 'aborted');
	gameutility.sendGameUpdateToBothPlayers(game);
}

/**
 * Called when a client tries to resign a game.
 * @param ws - The websocket
 * @param game - The game they are in.
 */
function resignGame(ws: CustomWebSocket, game: Game): void {

	// Is it legal?...

	if (gameutility.isGameOver(game)) {
		// Return if game is already over
		console.log(`Player resign to resign game ${game.id} when the game is already over!`);
		return;
	} else if (!gameutility.isGameResignable(game)) {
		// Return if player tries to resign when he does not have the right
		console.error(`Player tried to resign game ${game.id} when there's less than 2 moves played! Ignoring..`);
		return;
	}

	// Resign
	const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws)!;
	const opponentColor = typeutil.invertPlayer(ourColor);
	const gameConclusion = `${opponentColor} resignation`;
	setGameConclusion(game, gameConclusion);
	gameutility.sendGameUpdateToBothPlayers(game);
}


export {
	abortGame,
	resignGame,
};