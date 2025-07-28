
/**
 * The script handles when a user submits a move in
 * the game they are in, and does basic checks to make sure it's valid.
 */

import * as z from 'zod';

// Middleware imports
import { logEventsAndPrint } from '../../middleware/logEvents.js';

// Custom imports
import gameutility from './gameutility.js';
import socketUtility from '../../socket/socketUtility.js';

// @ts-ignore
import winconutil from '../../../client/scripts/esm/chess/util/winconutil.js';
import { declineDraw } from './onOfferDraw.js';
import { resyncToGame } from './resync.js';
import { pushGameClock, setGameConclusion, getGameBySocket } from './gamemanager.js';
import typeutil from '../../../client/scripts/esm/chess/util/typeutil.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import icnconverter from '../../../client/scripts/esm/chess/logic/icn/icnconverter.js';


import type { Player } from '../../../client/scripts/esm/chess/util/typeutil.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';
import type { BaseMove } from '../../../client/scripts/esm/chess/logic/movepiece.js';
import type { _Move_Out } from '../../../client/scripts/esm/chess/logic/icn/icnconverter.js';

/** The zod schema for validating the contents of the submitmove message. */
const submitmoveschem = z.strictObject({
	move: z.string(),
	moveNumber: z.int(),
	gameConclusion: z.string().optional(),
});

type SubmitMoveMessage = z.infer<typeof submitmoveschem>;

/**
 * 
 * Call when a websocket submits a move. Performs some checks,
 * adds the move to the game's move list, adjusts the game's
 * properties, and alerts their opponent of the move.
 * @param ws - The websocket submitting the move
 * @param messageContents - An object containing the properties `move`, `moveNumber`, and `gameConclusion`.
 */
function submitMove(ws: CustomWebSocket, messageContents: SubmitMoveMessage): void {
	const game = getGameBySocket(ws);

	// They can't submit a move if they aren't subscribed to a game
	if (!ws.metadata.subscriptions.game) {
		console.error("Player tried to submit a move when not subscribed. They should only send move when they are in sync, not right after the socket opens.");
		sendSocketMessage(ws, "general", "printerror", "Failed to submit move. You are not subscribed to a game.");
		return;
	}

	if (!game) {
		console.error(`Cannot submit move when player does not belong in a game! Game of id "${ws.metadata.subscriptions.game.id}" is deleted!`);
		return sendSocketMessage(ws, "general", "printerror", "Server error. Cannot submit move. This game does not exist.");
	}

	// Their subscription info should tell us what game they're in, including the color they are.
	const color = ws.metadata.subscriptions.game.color;
	const opponentColor = typeutil.invertPlayer(color);

	// If the game is already over, don't accept it.
	// Should we resync? Or tell the browser their move wasn't accepted? They will know if they need to resync.
	// The ACTUAL game conclusion SHOULD already be on the way to them so....
	if (gameutility.isGameOver(game)) return; 

	// Make sure the move number matches up. If not, they're out of sync, resync them!
	const expectedMoveNumber = game.moves.length + 1;
	if (messageContents.moveNumber !== expectedMoveNumber) {
		console.error(`Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`);
		return resyncToGame(ws, game.id);
	}

	// Make sure it's their turn
	if (game.whosTurn !== color) return sendSocketMessage(ws, "general", "printerror", "Cannot submit a move when it's not your turn.");

	// Legality checks...
	const moveDraft = doesMoveCheckOut(messageContents.move);
	if (moveDraft === false) {
		const errString = `Player sent a move in an invalid format. The message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		return sendSocketMessage(ws, "general", "printerror", "Invalid move format.");
	}
	if (!doesGameConclusionCheckOut(messageContents.gameConclusion, color)) {
		const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		return sendSocketMessage(ws, "general", "printerror", "Invalid game conclusion.");
	}
    
	const move: BaseMove = {
		startCoords: moveDraft.startCoords,
		endCoords: moveDraft.endCoords,
		compact: moveDraft.compact,
		// clockStamp added below
	};
	if (moveDraft.promotion !== undefined) move.promotion = moveDraft.promotion;
	// Must be BEFORE pushing the clock, because pushGameClock() depends on the length of the moves.
	game.moves.push(move); // Add the move to the list!
	// Must be AFTER pushing the move, because pushGameClock() depends on the length of the moves.
	const clockStamp = pushGameClock(game); // Flip whos turn and adjust the game properties
	if (clockStamp !== undefined) move.clockStamp = clockStamp; // If the clock stamp was set, add it to the move.
	setGameConclusion(game, messageContents.gameConclusion);

	// console.log(`Accepted a move! Their websocket message data:`)
	// console.log(messageContents)
	// console.log("New move list:")
	// console.log(game.moves);

	declineDraw(ws, game); // Auto-decline any open draw offer on move submissions

	if (gameutility.isGameOver(game)) gameutility.sendGameUpdateToColor(game, color);
	else gameutility.sendUpdatedClockToColor(game, color);
	gameutility.sendMoveToColor(game, opponentColor, move); // Send their move to their opponent.
}


/**
 * Returns true if their submitted move is in the format `x,y>x,y=3N`.
 * @param move - Their move submission.
 * @returns The move, if correctly formatted, otherwise false.
 */
function doesMoveCheckOut(move: string): _Move_Out | false {
	// Is the move in the correct format? "x,y>x,y=N"
	let moveDraft: _Move_Out;
	try {
		// THIS AUTOMATICALLY CHECKS if any coordinate would
		// become Infinity when cast to a number!
		moveDraft = icnconverter.parseCompactMove(move);
	} catch (e) {
		// It either didn't pass the regex, or one of the coordinates is Infinity,
		// OR the promoted piece abbreviation was invalid.
		return false;
	}

	return moveDraft;
}

/**
 * Returns true if the provided game conclusion seems reasonable for their move submission.
 * An example of a not reasonable one would be if they claimed they won by their opponent resigning.
 * This does not run the checkmate algorithm, so it's not foolproof.
 * @param gameConclusion - Their claimed game conclusion.
 * @param color - The color they are in the game.
 * @returns *true* if their claimed conclusion seems reasonable.
 */
function doesGameConclusionCheckOut(gameConclusion: string | undefined, color: Player): boolean {
	if (gameConclusion === undefined) return true;
	// It is a string...

	// If conclusion is "aborted", victor will not be specified.
	const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(gameConclusion);
	if (!winconutil.isConclusionDecisive(condition)) return false; // either resignation, time, or disconnect, or whatever nonsense they specified, none of these which the client can claim the win from (the server has to tell them)
	// Game conclusion is decisive...
	// We can't submit a move where our opponent wins
	const oppositeColor = typeutil.invertPlayer(color);
	return victor !== oppositeColor;
}


export {
	submitMove,
	
	submitmoveschem
};
