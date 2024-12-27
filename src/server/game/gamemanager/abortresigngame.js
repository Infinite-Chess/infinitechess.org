
/**
 * This script handles the abortings and resignations of online games
 */

import gameutility from './gameutility.js';
import { setGameConclusion, onRequestRemovalFromPlayersInActiveGames } from './gamemanager.js';
import colorutil from '../../../client/scripts/esm/chess/util/colorutil.js';
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
	const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

	// Any time they click "Abort Game", they leave the game to the Main Menu, unsubbing, whether or not it ends up being legal.
	gameutility.unsubClientFromGame(game, ws, { sendMessage: false });

	// Is it legal?...

	if (game.gameConclusion === 'aborted') { // Opponent aborted first.
		onRequestRemovalFromPlayersInActiveGames(ws, game);
		return;
	} else if (gameutility.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
		console.error("Player tried to abort game when the game is already over!");
		sendNotify(ws, "server.javascript.ws-no_abort_game_over");
		gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
		return;
	}

	if (gameutility.isGameResignable(game)) {
		console.error("Player tried to abort game when there's been atleast 2 moves played!");
		sendNotify(ws, "server.javascript.ws-no_abort_after_moves");
		gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
		return;
	}

	// Abort

	setGameConclusion(game, 'aborted');
	onRequestRemovalFromPlayersInActiveGames(ws, game);
	const opponentColor = colorutil.getOppositeColor(colorPlayingAs);
	gameutility.sendGameUpdateToColor(game, opponentColor);
}

/**
 * Called when a client tries to resign a game.
 * @param {CustomWebSocket} ws - The websocket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 */
function resignGame(ws, game) {
	if (!game) return console.error("Can't resign a game when player isn't in one.");

	// Any time they click "Resign Game", they leave the game to the Main Menu, unsubbing, whether or not it ends up being legal.
	gameutility.unsubClientFromGame(game, ws, { sendMessage: false });

	// Is it legal?...

	if (gameutility.isGameOver(game)) { // Resync them to the game because they did not see the game conclusion.
		console.error("Player tried to resign game when the game is already over!");
		sendNotify(ws, "server.javascript.ws-cannot_resign_finished_game");
		const colorPlayingAs = gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
		gameutility.subscribeClientToGame(game, ws, colorPlayingAs);
		return;
	}

	if (!gameutility.isGameResignable(game)) console.error("Player tried to resign game when there's less than 2 moves played! Ignoring..");

	// Resign

	const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	const opponentColor = colorutil.getOppositeColor(ourColor);
	const gameConclusion = `${opponentColor} resignation`;
	setGameConclusion(game, gameConclusion);
	onRequestRemovalFromPlayersInActiveGames(ws, game);
	gameutility.sendGameUpdateToColor(game, opponentColor);
}


export {
	abortGame,
	resignGame,
};