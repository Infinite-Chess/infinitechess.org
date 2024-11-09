
/**
 * The script handles when a user submits a move in
 * the game they are in, and does basic checks to make sure it's valid.
 */

// Middleware imports
import { logEvents } from '../../middleware/logEvents.js';

// Custom imports
import gameutility from './gameutility.js';
import wsutility from '../wsutility.js';

import { declineDraw } from './onOfferDraw.js';
import { resyncToGame } from './resync.js';
import { pushGameClock, setGameConclusion } from './gamemanager.js';
import colorutil from '../../../client/scripts/game/misc/colorutil.js';
import winconutil from '../../../client/scripts/game/misc/winconutil.js';

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

/**
 * 
 * Call when a websocket submits a move. Performs some checks,
 * adds the move to the game's move list, adjusts the game's
 * properties, and alerts their opponent of the move.
 * @param {Socket} ws - The websocket submitting the move
 * @param {Game | undefined} game - The game they are in, if they are in one.
 * @param {Object} messageContents - An object containing the properties `move`, `moveNumber`, and `gameConclusion`.
 */
function submitMove(ws, game, messageContents) {
	// They can't submit a move if they aren't subscribed to a game
	if (!ws.metadata.subscriptions.game) {
		console.error("Player tried to submit a move when not subscribed. They should only send move when they are in sync, not right after the socket opens.");
		ws.metadata.sendmessage(ws, "general", "printerror", "Failed to submit move. You are not subscribed to a game.");
		return;
	}

	if (!game) {
		console.error(`Cannot submit move when player does not belong in a game! Game of id "${ws.metadata.subscriptions.game.id}" is deleted!`);
		return ws.metadata.sendmessage(ws, "general", "printerror", "Server error. Cannot submit move. This game does not exist.");
	}

	// Their subscription info should tell us what game they're in, including the color they are.
	const color = ws.metadata.subscriptions.game.color;
	const opponentColor = colorutil.getOppositeColor(color);

	// If the game is already over, don't accept it.
	// Should we resync? Or tell the browser their move wasn't accepted? They will know if they need to resync.
	// The ACTUAL game conclusion SHOULD already be on the way to them so....
	if (gameutility.isGameOver(game)) return; 

	// Make sure the move number matches up. If not, they're out of sync, resync them!
	const expectedMoveNumber = game.moves.length + 1;
	if (messageContents.moveNumber !== expectedMoveNumber) {
		const errString = `Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
		logEvents(errString, 'hackLog.txt', { print: true });
		return resyncToGame(ws, game, game.id);
	}

	// Make sure it's their turn
	if (game.whosTurn !== color) return ws.metadata.sendmessage(ws, "general", "printerror", "Cannot submit a move when it's not your turn.");

	// Legality checks...
	if (!doesMoveCheckOut(messageContents.move)) {
		const errString = `Player sent a message that doesn't check out! Invalid format. The message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
		console.error(errString);
		logEvents(errString, 'hackLog.txt');
		return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid move format.");
	}
	if (!doesGameConclusionCheckOut(game, messageContents.gameConclusion, color)) {
		const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: ${JSON.stringify(messageContents)}. Socket: ${wsutility.stringifySocketMetadata(ws)}`;
		console.error(errString);
		logEvents(errString, 'hackLog.txt');
		return ws.metadata.sendmessage(ws, "general", "printerror", "Invalid game conclusion.");
	}
    
	game.moves.push(messageContents.move); // Add the move to the list!
	pushGameClock(game); // Flip whos turn and adjust the game properties
	setGameConclusion(game, messageContents.gameConclusion);

	// console.log(`Accepted a move! Their websocket message data:`)
	// console.log(messageContents)
	// console.log("New move list:")
	// console.log(game.moves);

	declineDraw(ws, game); // Auto-decline any open draw offer on move submissions

	if (gameutility.isGameOver(game)) gameutility.sendGameUpdateToColor(game, color);
	else gameutility.sendUpdatedClockToColor(game, color);
	gameutility.sendMoveToColor(game, opponentColor); // Send their move to their opponent.
}


/**
 * Returns true if their submitted move is in the format `x,y>x,y=N`.
 * @param {string} move - Their move submission.
 * @returns {boolean} *true* If the move is correctly formatted.
 */
function doesMoveCheckOut(move) {
	if (typeof move !== 'string') return false;
	// Is the move in the correct format? "x,y>x,y=N"
	const coordinates = move.split('>');
	if (coordinates.length !== 2) return false;
	const startCoordComponents = coordinates[0].split(',');
	const endCoordComponents = coordinates[1].split(',');
	if (startCoordComponents.length !== 2) return false;
	if (endCoordComponents.length < 2) return false;
	if (isNaN(parseInt(startCoordComponents[0]))) return false;
	if (isNaN(parseInt(startCoordComponents[1]))) return false;
	if (isNaN(parseInt(endCoordComponents[0]))) return false;
	// Right now, don't test the 2nd component of the endCoord, because we haven't split it off the promotion piece.
	return true;
}

/**
 * Returns true if the provided game conclusion seems reasonable for their move submission.
 * An example of a not reasonable one would be if they claimed they won by their opponent resigning.
 * This does not run the checkmate algorithm, so it's not foolproof.
 * @param {Game} game - The game
 * @param {string | false} gameConclusion - Their claimed game conclusion.
 * @param {string} color - The color they are in the game.
 * @returns {boolean} *true* if their claimed conclusion seems reasonable.
 */
function doesGameConclusionCheckOut(game, gameConclusion, color) {
	if (gameConclusion === false) return true;
	if (typeof gameConclusion !== 'string') return false;

	// If conclusion is "aborted", victor will not be specified.
	const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(gameConclusion);
	if (!winconutil.isConclusionDecisive(condition)) return false; // either resignation, time, or disconnect, or whatever nonsense they specified, none of these which the client can claim the win from (the server has to tell them)
	// Game conclusion is decisive...
	// We can't submit a move where our opponent wins
	const oppositeColor = colorutil.getOppositeColor(color);
	return victor !== oppositeColor;
}


export {
	submitMove
};
