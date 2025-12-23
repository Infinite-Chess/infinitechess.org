/**
 * This script flags private games that have a custom position pasted.
 */

import { logEventsAndPrint } from '../../middleware/logEvents.js';
import gameutility from './gameutility.js';

import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { ServerGame } from './gameutility.js';

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
function onPaste(ws: CustomWebSocket, servergame: ServerGame): void {
	// { reason, opponentsMoveNumber }
	console.log('Client pasted a game.');

	const ourColor =
		ws.metadata.subscriptions.game?.color ||
		gameutility.doesSocketBelongToGame_ReturnColor(servergame.match, ws);

	if (servergame.match.publicity !== 'private') {
		const errString = `Player reported pasting in a non-private game. Reporter color: ${ourColor}. Number of moves played: ${servergame.basegame.moves.length}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
		logEventsAndPrint(errString, 'errLog.txt');
		return;
	}

	if (servergame.match.rated) {
		const errString = `Player reported pasting in a rated game. Reporter color: ${ourColor}. Number of moves played: ${servergame.basegame.moves.length}.\nThe game: ${gameutility.getSimplifiedGameString(servergame)}`;
		logEventsAndPrint(errString, 'errLog.txt');
		return;
	}

	// Flag the game to not be logged
	servergame.match.positionPasted = true;
}

export { onPaste };
