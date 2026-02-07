// src/server/game/gamemanager/movesubmission.ts

/**
 * The script handles when a user submits a move in
 * the game they are in, and does basic checks to make sure it's valid.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { BaseMove } from '../../../shared/chess/logic/movepiece.js';
import type { _Move_Out } from '../../../shared/chess/logic/icn/icnconverter.js';
import type { GameConclusion } from '../../../shared/chess/logic/gamefile.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import bimath from '../../../shared/util/math/bimath.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import { GAME_CONCLUSION_CONDITIONS } from '../../../shared/chess/logic/gamefile.js';

import socketUtility from '../../socket/socketUtility.js';
import { declineDraw } from './onOfferDraw.js';
import { resyncToGame } from './resync.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import gameutility, { ServerGame } from './gameutility.js';
import { pushGameClock, setGameConclusion } from './gamemanager.js';

/** The zod schema for validating the contents of the submitmove message. */
const submitmoveschem = z.strictObject({
	move: z.string(),
	moveNumber: z.int(),
	gameConclusion: z
		.strictObject({
			condition: z.enum(GAME_CONCLUSION_CONDITIONS),
			victor: z.number().int().nonnegative().optional() as z.ZodType<Player | undefined>,
		})
		.optional(),
});

type SubmitMoveMessage = z.infer<typeof submitmoveschem>;

/** The number of additional coordinate digits allowed per second of game duration. */
const DIGITS_PER_SECOND = 4.5;

/**
 *
 * Call when a websocket submits a move. Performs some checks,
 * adds the move to the game's move list, adjusts the game's
 * properties, and alerts their opponent of the move.
 * @param ws - The websocket submitting the move.
 * @param servergame - The game they are in.
 * @param messageContents - An object containing the properties `move`, `moveNumber`, and `gameConclusion`.
 */
function submitMove(
	ws: CustomWebSocket,
	servergame: ServerGame,
	messageContents: SubmitMoveMessage,
): void {
	// They can't submit a move if they aren't subscribed to a game
	if (!ws.metadata.subscriptions.game) {
		console.error(
			'Player tried to submit a move when not subscribed. They should only send move when they are in sync, not right after the socket opens.',
		);
		sendSocketMessage(
			ws,
			'general',
			'printerror',
			'Failed to submit move. You are not subscribed to a game.',
		);
		return;
	}

	// Their subscription info should tell us what game they're in, including the color they are.
	const color = ws.metadata.subscriptions.game.color;
	const opponentColor = typeutil.invertPlayer(color);

	// If the game is already over, don't accept it.
	// Should we resync? Or tell the browser their move wasn't accepted? They will know if they need to resync.
	// The ACTUAL game conclusion SHOULD already be on the way to them so....
	if (gameutility.isGameOver(servergame.basegame)) return;

	// Make sure the move number matches up. If not, they're out of sync, resync them!
	const expectedMoveNumber = servergame.basegame.moves.length + 1;
	if (messageContents.moveNumber !== expectedMoveNumber) {
		console.error(
			`Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`,
		);
		return resyncToGame(ws, servergame.match.id);
	}

	// Make sure it's their turn
	if (servergame.basegame.whosTurn !== color)
		return sendSocketMessage(
			ws,
			'general',
			'printerror',
			"Cannot submit a move when it's not your turn.",
		);

	// Legality checks...
	const moveDraft = doesMoveCheckOut(messageContents.move);
	if (moveDraft === false) {
		const errString = `Player sent a move in an invalid format. The message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		return sendSocketMessage(ws, 'general', 'printerror', 'Invalid move format.');
	}

	// Check if the move exceeds the soft distance cap based on game duration
	if (!isMoveWithinDistanceCap(moveDraft, servergame.match.timeCreated)) {
		const errString = `Player sent a move that exceeds the distance cap for game duration. The message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		sendSocketMessage(
			ws,
			'general',
			'notifyerror',
			'Move not accepted. Distance exceeds allowed limit for game duration.',
		);
		return;
	}

	if (!doesGameConclusionCheckOut(messageContents.gameConclusion, color)) {
		const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: ${JSON.stringify(messageContents)}. Socket: ${socketUtility.stringifySocketMetadata(ws)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		return sendSocketMessage(ws, 'general', 'printerror', 'Invalid game conclusion.');
	}

	const move: BaseMove = {
		startCoords: moveDraft.startCoords,
		endCoords: moveDraft.endCoords,
		compact: moveDraft.compact,
		// clockStamp added below
	};
	if (moveDraft.promotion !== undefined) move.promotion = moveDraft.promotion;
	// Must be BEFORE pushing the clock, because pushGameClock() depends on the length of the moves.
	servergame.basegame.moves.push(move); // Add the move to the list!
	// Must be AFTER pushing the move, because pushGameClock() depends on the length of the moves.
	const clockStamp = pushGameClock(servergame); // Flip whos turn and adjust the game properties
	if (clockStamp !== undefined) move.clockStamp = clockStamp; // If the clock stamp was set, add it to the move.
	setGameConclusion(servergame, messageContents.gameConclusion);

	// console.log(`Accepted a move! Their websocket message data:`)
	// console.log(messageContents)
	// console.log("New move list:")
	// console.log(game.moves);

	declineDraw(ws, servergame); // Auto-decline any open draw offer on move submissions

	if (gameutility.isGameOver(servergame.basegame))
		gameutility.sendGameUpdateToColor(servergame, color);
	else gameutility.sendUpdatedClockToColor(servergame, color);
	gameutility.sendMoveToColor(servergame, opponentColor, move); // Send their move to their opponent.
}

/**
 * Calculates the maximum distance a move should be allowed based on game duration.
 * @param gameStartTime - When the game was created (in milliseconds)
 * @returns Maximum allowed coordinate digits
 */
function getMaxAllowedCoordinateDigits(gameStartTime: number): number {
	const currentTime = Date.now();
	const gameElapsedSeconds = (currentTime - gameStartTime) / 1000;

	// Start with a baseline of 1 digit (allows coordinates like -9 to 9)
	const baselineDigits = 1;
	const extraDigits = gameElapsedSeconds * DIGITS_PER_SECOND;

	return Math.floor(baselineDigits + extraDigits);
}

/**
 * Checks if a move's coordinates exceed the soft distance cap based on game duration.
 * Only checks end coordinates since start coordinates are known to be safe.
 * @param moveDraft - The parsed move to check
 * @param gameStartTime - When the game was created (in milliseconds)
 * @returns true if the move is within allowed distance, false otherwise
 */
function isMoveWithinDistanceCap(moveDraft: _Move_Out, gameStartTime: number): boolean {
	const maxAllowedDigits = getMaxAllowedCoordinateDigits(gameStartTime);

	// Only check end coordinates since start coordinates are safe
	const endXDigits = bimath.countDigits(moveDraft.endCoords[0]);
	const endYDigits = bimath.countDigits(moveDraft.endCoords[1]);

	const maxDigitsInMove = Math.max(endXDigits, endYDigits);

	return maxDigitsInMove <= maxAllowedDigits;
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
	} catch {
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
function doesGameConclusionCheckOut(
	gameConclusion: GameConclusion | undefined,
	color: Player,
): boolean {
	if (gameConclusion === undefined) return true;

	const { victor, condition } = gameConclusion;
	if (!winconutil.isConclusionDecisive(condition)) return false; // either resignation, time, or disconnect, or whatever nonsense they specified, none of these which the client can claim the win from (the server has to tell them)
	// Game conclusion is decisive...
	// We can't submit a move where our opponent wins
	const oppositeColor = typeutil.invertPlayer(color);
	return victor !== oppositeColor;
}

export { submitMove, submitmoveschem };
