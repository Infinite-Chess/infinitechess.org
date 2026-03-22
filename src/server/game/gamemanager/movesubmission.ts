// src/server/game/gamemanager/movesubmission.ts

/**
 * The script handles when a user submits a move in
 * the game they are in, and does basic checks to make sure it's valid.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { FullGame } from '../../../shared/chess/logic/gamefile.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { MoveParsed } from '../../../shared/chess/logic/icn/icnconverter.js';
import type { GameConclusion } from '../../../shared/chess/util/winconutil.js';
import type { CustomWebSocket } from '../../socket/socketUtility.js';

import * as z from 'zod';

import bimath from '../../../shared/util/math/bimath.js';
import typeutil from '../../../shared/chess/util/typeutil.js';
import movepiece from '../../../shared/chess/logic/movepiece.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import movevalidation from '../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../shared/chess/util/gamefileutility.js';

import liveGameValues from './liveGameValues.js';
import { declineDraw } from './onOfferDraw.js';
import { resyncToGame } from './resync.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { sendSocketMessage } from '../../socket/sendSocketMessage.js';
import gameutility, { ServerGame } from './gameutility.js';
import { pushGameClock, finalizeConclusion, teardownGame } from './gamemanager.js';

/** The zod schema for validating the contents of the submitmove message. */
const submitmoveschem = z.strictObject({
	move: z.string(),
	moveNumber: z.int(),
	gameConclusion: winconutil.gameConclusionSchema.optional(),
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
	if (gameutility.isGameOver(servergame.basegame)) return;

	// Make sure it's their turn
	if (servergame.basegame.whosTurn !== color) {
		// Can occasionally happen if they in rapid succession send a resync request and
		// a move submission, then when their client resyncs they submit their move again.
		// Just discard this submission and resync just in case they are actually out of sync.
		resyncToGame(ws, servergame.match.id);
		return;
	}

	// Make sure the move number matches up. If not, they're out of sync, resync them!
	const expectedMoveNumber = servergame.basegame.moves.length + 1;
	if (messageContents.moveNumber !== expectedMoveNumber) {
		const errString = `Client submitted a move with incorrect move number! Expected: ${expectedMoveNumber}   Message: ${JSON.stringify(messageContents)}. User: ${JSON.stringify(ws.metadata.memberInfo)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		resyncToGame(ws, servergame.match.id);
		return;
	}

	// Verify the move is in the correct format
	const moveParsed = doesMoveCheckOut(messageContents.move);
	if (moveParsed === false) {
		const errString = `Player sent a move in an invalid format. The message: ${JSON.stringify(messageContents)}. User: ${JSON.stringify(ws.metadata.memberInfo)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', 'Invalid move format.');
		return;
	}

	// Check if the move exceeds the soft distance cap based on game duration
	if (!isMoveWithinDistanceCap(moveParsed, servergame.match.timeCreated)) {
		const errString = `Player sent a move that exceeds the distance cap for game duration. The message: ${JSON.stringify(messageContents)}. User: ${JSON.stringify(ws.metadata.memberInfo)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		sendSocketMessage(
			ws,
			'general',
			'notifyerror',
			'Move not accepted. Distance exceeds allowed limit for game duration.',
		);
		return;
	}

	// Use server-side validation if the boardsim exists, otherwise trust the client's reported conclusion.
	const moveRecord =
		servergame.boardsim !== undefined
			? applyServerValidatedMove(ws, servergame, messageContents, moveParsed, color)
			: applyClientReportedMove(ws, servergame, messageContents, moveParsed, color);
	if (moveRecord === undefined) return; // The move was illegal, or the conclusion was invalid, and we've already sent the appropriate error message to the client, so just exit.

	// console.log(`Accepted a move! Their websocket message data:`)
	// console.log(messageContents)
	// console.log("New move list:")
	// console.log(game.moves);

	declineDraw(ws, servergame); // Auto-decline any open draw offer on move submissions

	// Persist the move and updated game state to the database.
	liveGameValues.onMoveSubmitted(servergame);

	const gameIsOver = gameutility.isGameOver(servergame.basegame);

	if (gameIsOver) {
		// If the game ended, finalize state before sending: stops the clock and persists to DB.
		// This ensures both clients receive the same frozen clock values that are in the DB.
		finalizeConclusion(servergame, servergame.basegame.gameConclusion);
		// Send a whole gameupdate to the move-submitter
		gameutility.sendGameUpdateToColor(servergame, color, false);
	} else {
		// Just send updated clocks to the move-submitter
		gameutility.sendUpdatedClockToColor(servergame, color);
	}
	// Send their move to their opponent.
	gameutility.sendMoveToColor(servergame, opponentColor, moveRecord);

	// Tear down the game after sends. teardownGame skips broadcastGameUpdate for
	// move-triggered conclusions since clients were already notified individually above.
	if (gameIsOver) teardownGame(servergame);
}

/**
 * Validates the move against the server-side board simulation, makes it, and updates the game state.
 * Returns the resulting MoveRecord, or undefined if the move was illegal (error messages are sent to the client).
 */
function applyServerValidatedMove(
	ws: CustomWebSocket,
	servergame: ServerGame,
	messageContents: SubmitMoveMessage,
	moveParsed: MoveParsed,
	color: Player,
): MoveRecord | undefined {
	// Makes ts happy knowing boardsim is already defined
	const gamefile: FullGame = { basegame: servergame.basegame, boardsim: servergame.boardsim! };

	const validationResult = movevalidation.validateMove(gamefile, moveParsed);
	if (!validationResult.valid) {
		const errString = `Player sent an illegal move: "${messageContents.move}" Reason: ${validationResult.reason} User: ${JSON.stringify(ws.metadata.memberInfo)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		// Send the sender a gameupdate to correct their board if a bug somehow caused this
		gameutility.sendGameUpdateToColor(servergame, color, true); // forceSync true to force their move list to match ours
		// Send notifyerror last to override any previous toasts
		sendSocketMessage(
			ws,
			'general',
			'notifyerror',
			'Oops! That was an illegal move. If this is a bug, please report it!',
		);
		return;
	}

	// Generate and make the move in the logical game
	const fullMove = movepiece.generateAndMakeMove(gamefile, validationResult.tagged);

	// Set the clock stamp on both the boardsim's MoveFull and the basegame's MoveRecord.
	// (makeMove creates a separate MoveRecord object for basegame, so we must set both.)
	const moveRecord = servergame.basegame.moves[servergame.basegame.moves.length - 1]!;
	const clockStamp = pushGameClock(servergame);
	if (clockStamp !== undefined) {
		fullMove.clockStamp = clockStamp;
		moveRecord.clockStamp = clockStamp;
	}

	// The server determines the game conclusion; discard any client-claimed conclusion.
	// Auto-sets basegame.gameConclusion if the move triggers a conclusion.
	gamefileutility.doGameOverChecks(gamefile);

	return moveRecord;
}

/**
 * Accepts a move for large variants without server-side validation, and updates the game state.
 * Returns the resulting MoveRecord, or undefined if the claimed game conclusion was invalid.
 */
function applyClientReportedMove(
	ws: CustomWebSocket,
	servergame: ServerGame,
	messageContents: SubmitMoveMessage,
	moveParsed: MoveParsed,
	color: Player,
): MoveRecord | undefined {
	if (!doesGameConclusionCheckOut(messageContents.gameConclusion, color)) {
		const errString = `Player sent a conclusion that doesn't check out! Invalid. The message: "${JSON.stringify(messageContents)}" User: ${JSON.stringify(ws.metadata.memberInfo)}`;
		logEventsAndPrint(errString, 'hackLog.txt');
		sendSocketMessage(ws, 'general', 'printerror', 'Invalid game conclusion.');
		return;
	}

	const moveRecord: MoveRecord = {
		startCoords: moveParsed.startCoords,
		endCoords: moveParsed.endCoords,
		token: moveParsed.token,
		// clockStamp added below
	};
	if (moveParsed.promotion !== undefined) moveRecord.promotion = moveParsed.promotion;
	// Must be BEFORE pushing the clock, because pushGameClock() depends on the length of the moves.
	servergame.basegame.moves.push(moveRecord); // Add the move to the list!
	// Must be AFTER pushing the move, because pushGameClock() depends on the length of the moves.
	const clockStamp = pushGameClock(servergame); // Flip whos turn and adjust the game properties
	if (clockStamp !== undefined) moveRecord.clockStamp = clockStamp; // If the clock stamp was set, add it to the move.

	// Manually set basegame.gameConclusion to client-reported conclusion
	gamefileutility.setConclusion(servergame.basegame, messageContents.gameConclusion);

	return moveRecord;
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
 * @param moveParsed - The parsed move to check
 * @param gameStartTime - When the game was created (in milliseconds)
 * @returns true if the move is within allowed distance, false otherwise
 */
function isMoveWithinDistanceCap(moveParsed: MoveParsed, gameStartTime: number): boolean {
	const maxAllowedDigits = getMaxAllowedCoordinateDigits(gameStartTime);

	// Only check end coordinates since start coordinates are safe
	const endXDigits = bimath.countDigits(moveParsed.endCoords[0]);
	const endYDigits = bimath.countDigits(moveParsed.endCoords[1]);

	const maxDigitsInMove = Math.max(endXDigits, endYDigits);

	return maxDigitsInMove <= maxAllowedDigits;
}

/**
 * Returns true if their submitted move is in the format `x,y>x,y=3N`.
 * @param move - Their move submission.
 * @returns The move, if correctly formatted, otherwise false.
 */
function doesMoveCheckOut(move: string): MoveParsed | false {
	// Is the move in the correct format? "x,y>x,y=N"
	let moveParsed: MoveParsed;
	try {
		moveParsed = icnconverter.parseTokenMove(move);
	} catch {
		// It either didn't pass the regex, or the promoted piece abbreviation was invalid.
		return false;
	}

	return moveParsed;
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
	if (!winconutil.isConclusionMoveTriggered(condition)) return false;
	// We can't submit a move where our opponent wins
	const oppositeColor = typeutil.invertPlayer(color);
	return victor !== oppositeColor;
}

export { submitMove, submitmoveschem };
