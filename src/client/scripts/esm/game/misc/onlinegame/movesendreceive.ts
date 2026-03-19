// src/client/scripts/esm/game/misc/onlinegame/movesendreceive.ts

/**
 * This script handles sending our move in online games to the server,
 * and receiving moves from our opponent.
 */

import type { Mesh } from '../../rendering/piecemodels.js';
import type { FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { MoveTagged } from '../../../../../../shared/chess/logic/movepiece.js';
import type { ClockValues } from '../../../../../../shared/chess/logic/clock.js';
import type { OpponentsMoveMessage } from '../../../../../../server/game/gamemanager/gameutility.js';
import type { MoveValidationResult } from '../../../../../../shared/chess/logic/movevalidation.js';

import clock from '../../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import { isGameInstantlyDeleted } from '../../../../../../shared/chess/variants/servervalidation.js';

import gameslot from '../../chess/gameslot.js';
import guiclock from '../../gui/guiclock.js';
import premoves from '../../chess/premoves.js';
import guipause from '../../gui/guipause.js';
import selection from '../../chess/selection.js';
import socketsubs from '../../websocket/socketsubs.js';
import onlinegame from './onlinegame.js';
import { GameBus } from '../../GameBus.js';
import movesequence from '../../chess/movesequence.js';
import socketmessages from '../../websocket/socketmessages.js';

// Events ---------------------------------------------------------------------

GameBus.addEventListener('user-move-played', () => {
	sendMove();
});

// Functions -------------------------------------------------------------------

/**
 * Called when selection.js moves a piece. This will send it to the server
 * if we're in an online game.
 */
function sendMove(): void {
	if (
		!onlinegame.areInOnlineGame() ||
		!onlinegame.areInSync() ||
		!socketsubs.areSubbedToSub('game')
	)
		return; // Skip
	// console.log("Sending our move..");

	const gamefile = gameslot.getGamefile()!;
	const lastMove = moveutil.getLastMove(gamefile.boardsim.moves)!;
	const moveToken = lastMove.token; // "x,y>x,yN"

	const data = {
		move: moveToken,
		moveNumber: gamefile.basegame.moves.length,
		gameConclusion: gamefile.basegame.gameConclusion,
	};

	socketmessages.send('game', 'submitmove', data, true);

	onlinegame.onMovePlayed({ isOpponents: false });
}

/**
 * Called when we received our opponents move. This verifies they're move
 * and claimed game conclusion is legal. If it isn't, it reports them and doesn't forward their move.
 * If it is legal, it forwards the game to the front, then forwards their move.
 */
function handleOpponentsMove(
	gamefile: FullGame,
	mesh: Mesh | undefined,
	message: OpponentsMoveMessage,
): void {
	// Make sure the move number matches the expected.
	const expectedMoveNumber = gamefile.boardsim.moves.length + 1;
	if (message.moveNumber !== expectedMoveNumber) {
		// A desync happened
		console.error(
			`We have desynced from the game. Resyncing. Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's move: ${JSON.stringify(message.move)}. Move number: ${message.moveNumber}`,
		);
		return onlinegame.resyncToGame();
	}

	// Convert the move from compact short format "x,y>x,y=N" to JSON.
	// Gauranteed by the server to be parsable.
	const moveTagged: MoveTagged = icnconverter.parseTokenMove(message.move.token);

	premoves.performWithUnapplied(gamefile, mesh, () => {
		// If not legal, this will be a string for why it is illegal.
		// THIS ATTACHES ANY SPECIAL FLAGS TO THE MOVE
		const moveValidationResult = movevalidation.isOpponentsMoveLegal(
			gamefile,
			moveTagged,
			message.gameConclusion,
		);

		// Only report cheating when the server won't delete the game instantly.
		if (
			checkAndReportIllegalOpponentMove(
				gamefile,
				moveValidationResult,
				message.move.token,
				message.moveNumber,
			)
		) {
			return false; // Don't physically play next premove
		}

		// At this stage, the move is legal, or allowed anyway in a private game. Apply it.

		// Go to latest move before making a new move
		movesequence.viewFront(gamefile, mesh);

		movesequence.makeMoveAndAnimate(gamefile, mesh, moveTagged);

		// Edit the clocks

		const { basegame } = gamefile;

		// Adjust the timer whos turn it is depending on ping.
		applyClockValues(gamefile, message.clockValues);

		// For online games, the server is boss, so if they say the game is over, conclude it here.
		if (gamefileutility.isGameOver(basegame)) gameslot.concludeGame();

		onlinegame.onMovePlayed({ isOpponents: true });
		guipause.onReceiveOpponentsMove(); // Update the pause screen buttons

		return true; // Good to physically play next premove
	});

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.
}

/**
 * Logs an illegal opponent move and reports it to the server if the game warrants it.
 * @param moveValidationResult - The result of move validation (may be valid or invalid).
 * @param tokenMove - The move in compact string format, used for logging.
 * @param moveNumber - The move number, used for logging.
 * @returns Whether the move was illegal and was reported.
 */
function checkAndReportIllegalOpponentMove(
	gamefile: FullGame,
	moveValidationResult: MoveValidationResult,
	tokenMove: string,
	moveNumber: number,
): boolean {
	if (moveValidationResult.valid) return false;

	console.log(
		`Buddy made an illegal play: "${tokenMove}". Reason: ${moveValidationResult.reason} Move number: ${moveNumber}`,
	);

	if (
		!isGameInstantlyDeleted(
			gamefile.boardsim.variant,
			gamefile.basegame.dateTimestamp,
			onlinegame.getIsPrivate(),
		)
	) {
		onlinegame.reportOpponentsMove(moveValidationResult.reason);
		return true;
	}

	return false; // Private or server-validated game — allow through without reporting
}

/** Adjusts received clock values for ping and applies them to the game, if provided. */
function applyClockValues(gamefile: FullGame, clockValues: ClockValues | undefined): void {
	if (!clockValues) return;
	if (gamefile.basegame.untimed) {
		console.warn('Received clock values for untimed game??');
		return;
	}
	clockValues = onlinegame.adjustClockValuesForPing(clockValues);
	clock.edit(gamefile.basegame.clocks, clockValues);
	guiclock.edit(gamefile.basegame);
}

// Exports -------------------------------------------------------------------

export default {
	sendMove,
	handleOpponentsMove,
	checkAndReportIllegalOpponentMove,
	applyClockValues,
};
