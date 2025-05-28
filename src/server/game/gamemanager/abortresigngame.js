
/**
 * This script handles the abortings and resignations of online games
 */

import gameutility from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';
import { sendNotify } from '../../socket/sendSocketMessage.js';

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

//--------------------------------------------------------------------------------------------------------

/**
 * Called when a client tries to abort a game.
 * @param {CustomWebSocket} ws - The websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function abortGame(ws, game) {
	if (!game) return console.error("Can't abort a game when player isn't in one.");

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
 * @param {CustomWebSocket} ws - The websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function resignGame(ws, game) {
	if (!game) return console.error("Can't resign a game when player isn't in one.");

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

	const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	const opponentColor = typeutil.invertPlayer(ourColor);
	const gameConclusion = `${opponentColor} resignation`;
	setGameConclusion(game, gameConclusion);
	gameutility.sendGameUpdateToBothPlayers(game);
}


export {
	abortGame,
	resignGame,
};