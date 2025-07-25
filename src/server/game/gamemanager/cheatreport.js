
/**
 * This script handles cheat reports, aborting games when they come in.
 */

// Middleware imports
import { logEvents, logEventsAndPrint } from '../../middleware/logEvents.js';

// Custom imports
import gameutility from './gameutility.js';
import { setGameConclusion } from './gamemanager.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';

/**
 * Type Definitions
 * @typedef {  import('./gameutility.js').Game} Game
 */

/** @typedef {import("../../socket/socketUtility.js").CustomWebSocket} CustomWebSocket */

/**
 * 
 * @param {CustomWebSocket} ws - The socket
 * @param {Game | undefined} game - The game they belong in, if they belong in one.
 * @param {*} messageContents - The contents of the socket report message
 * @returns {true | undefined} true if the cheat report was valid (the game manager should terminate the game), otherwise undefined.
 */
function onReport(ws, game, messageContents) { // { reason, opponentsMoveNumber }
	console.log("Client reported hacking!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

	if (!game) return console.error("Unable to find game after a hack report.");

	const ourColor = ws.metadata.subscriptions.game?.color || gameutility.doesSocketBelongToGame_ReturnColor(game, ws);
	const opponentColor = typeutil.invertPlayer(ourColor);

	if (game.publicity === 'private') {
		const errString = `Player tried to report cheating in a private game! Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		gameutility.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', 'Cannot report your friend for cheating in a private match!');
		return;
	}

	const perpetratingMoveIndex = game.moves.length - 1;
	const colorThatPlayedPerpetratingMove = gameutility.getColorThatPlayedMoveIndex(game, perpetratingMoveIndex);
	if (colorThatPlayedPerpetratingMove === ourColor) {
		const errString = `Silly goose player tried to report themselves for cheating. Report message: ${JSON.stringify(messageContents)}. Reporter color: ${ourColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		gameutility.sendMessageToSocketOfColor(game, ourColor, 'general', 'printerror', "Silly goose. You can't report yourself for cheating! You played that move!");
		return;
	}

	// Remove the last move played.
	const perpetratingMove = game.moves.pop();
    
	const reason = messageContents?.reason;
	const opponentsMoveNumber = messageContents?.opponentsMoveNumber;

	const errText = `Cheating reported! Perpetrating move: ${perpetratingMove}. Move number: ${opponentsMoveNumber}. The report description: ${reason}. Color who reported: ${ourColor}. Probably cheater: ${JSON.stringify(game[opponentColor])}. Their color: ${opponentColor}.\nThe game: ${gameutility.getSimplifiedGameString(game)}`;
	console.error(errText);
	logEvents(errText, 'hackLog.txt');
    
	for (const player in game.players) {
		gameutility.sendMessageToSocketOfColor(game, player, 'general', 'notify', "server.javascript.ws-game_aborted_cheating");
	}
	// Cheating report was valid, terminate the game..

	setGameConclusion(game, 'aborted');
	gameutility.sendGameUpdateToBothPlayers(game);
}


export {
	onReport
};