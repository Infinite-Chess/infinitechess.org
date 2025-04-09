
/**
 * This script flags private games that have a custom position pasted.
 */


import type { CustomWebSocket } from '../../socket/socketUtility.js';
// @ts-ignore
import { logEvents } from '../../middleware/logEvents.js';
// @ts-ignore
import gameutility from './gameutility.js';
// @ts-ignore
import type { Game } from '../TypeDefinitions.js';


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
function onPaste(ws: CustomWebSocket, game?: Game) { // { reason, opponentsMoveNumber }
	console.log("Client pasted a game.");

	if (!game) return console.error("Unable to find game after a paste report.");

	if (game.publicity !== 'private') {
		const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
		const errString = `Player reported pasting in a non-private game. Reporter color: ${ourColor}. Number of moves played: ${game.moves.length}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
		logEvents(errString, 'errLog.txt', { print: true });
		return;
	}

	// Flag the game to not be logged
	game.positionPasted = true;
}


export {
	onPaste
};