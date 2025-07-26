
/**
 * This script flags private games that have a custom position pasted.
 */


import type { CustomWebSocket } from '../../socket/socketUtility.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import gameutility from './gameutility.js';
import { getGameBySocket } from './gamemanager.js';

/**
 * Called when a player submits a websocket message informing us they
 * pasted a game in a private match.
 * 
 * We don't want to log custom games when they're finished,
 * because we don't know their starting position, the game
 * would crash if we attempted to paste it.
 * @param ws - The socket
 * @param game - The game they belong in, if they belong in one.
 */
function onPaste(ws: CustomWebSocket) { // { reason, opponentsMoveNumber }
	console.log("Client pasted a game.");
	const game = getGameBySocket(ws);
	if (!game) return console.error("Unable to find game after a paste report.");

	const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);

	if (game.publicity !== 'private') {
		const errString = `Player reported pasting in a non-private game. Reporter color: ${ourColor}. Number of moves played: ${game.moves.length}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
		logEventsAndPrint(errString, 'errLog.txt');
		return;
	}

	if (game.rated) {
		const errString = `Player reported pasting in a rated game. Reporter color: ${ourColor}. Number of moves played: ${game.moves.length}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
		logEventsAndPrint(errString, 'errLog.txt');
		return;
	}

	// Flag the game to not be logged
	game.positionPasted = true;
}


export {
	onPaste
};