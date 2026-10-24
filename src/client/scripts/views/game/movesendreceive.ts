// src/client/scripts/views/game/movesendreceive.ts

/**
 * This script handles sending our move in online games to the server,
 * and receiving moves from our opponent.
 */

import type { Mesh } from '../../board/rendering/piecemodels.js';
import type { GameFile } from '../../../../shared/chess/logic/gamefile.js';
import type { MoveTagged } from '../../../../shared/chess/logic/movepiece.js';
import type { ClockValues } from '../../../../shared/chess/util/clockutil.js';
import type { MoveValidationResult } from '../../../../shared/chess/logic/movevalidation.js';
import type { OpponentsMoveMessage } from '../../../../shared/transport/clientbound.js';

import clock from '../../../../shared/chess/logic/clock.js';
import icnmoves from '../../../../shared/chess/logic/icn/icnmoves.js';
import movevalidation from '../../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../../shared/chess/logic/gamefileutility.js';
import servervalidation from '../../../../shared/chess/variants/servervalidation.js';

import gameslot from '../../game/chess/gameslot.js';
import guiclock from '../../game/gui/guiclock.js';
import premoves from '../../game/chess/premoves.js';
import selection from '../../game/chess/selection.js';
import onlinegame from './onlinegame.js';
import socketsend from '../../socket/socketsend.js';
import { GameBus } from '../../board/GameBus.js';
import gamesession from '../../game/chess/gamesession.js';
import movesequence from '../../game/chess/movesequence.js';

// Events ----------------------------------------------------------------------

GameBus.addEventListener('user-move-played', () => sendMove());
GameBus.addEventListener('engine-move-played', () => sendMove());

// Functions -------------------------------------------------------------------

/** Called when we or our engine play a move, sending it to the server. */
function sendMove(): void {
	if (!onlinegame.areInSync()) return; // Skip, our move will be auto-submitted when we resync

	const gamefile = gameslot.getGamefile()!;
	submitMove(gamefile, gamefile.moves.length - 1);
}

/** Sends a single move from our moves list to the server, by its index. */
function submitMove(gamefile: GameFile, moveIndex: number): void {
	const isLastMove = moveIndex === gamefile.moves.length - 1;

	const data = {
		move: gamefile.moves[moveIndex]!.token,
		moveNumber: moveIndex + 1,
		// Only our latest move can have triggered the conclusion we detected locally.
		gameConclusion: isLastMove ? gamefile.gameConclusion : undefined,
	};

	void socketsend.send('game', 'submitmove', data);
}

/**
 * Submits every move from `startIndex` onward, catching the server up after a resync.
 * The server accepts them back-to-back, each matching its next expected move number.
 */
function submitMovesFrom(gamefile: GameFile, startIndex: number): void {
	for (let i = startIndex; i < gamefile.moves.length; i++) submitMove(gamefile, i);
}

/**
 * Called when we received our opponents move. This verifies their move is legal, and their claimed
 * conclusion if the server didn't validate it. If not, it reports them and doesn't forward their move.
 * If it is legal, it forwards the game to the front, then forwards their move.
 */
function handleMove(
	gamefile: GameFile,
	mesh: Mesh | undefined,
	message: OpponentsMoveMessage,
): void {
	// Make sure the move number matches the expected.
	const expectedMoveNumber = gamefile.moves.length + 1;
	if (message.moveNumber !== expectedMoveNumber) {
		// A desync happened
		console.error(`We have desynced from the game. Resyncing. Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's move: ${JSON.stringify(message.move)}. Move number: ${message.moveNumber}`); // prettier-ignore
		onlinegame.setInSync(false);
		onlinegame.subscribeToGame(); // Naturally requests the full game state and resyncs
		return;
	}

	// Guaranteed by the server to be parsable.
	const moveTagged: MoveTagged = icnmoves.parseTokenMove(message.move.token);

	premoves.performWithUnapplied(gamefile, mesh, () => {
		// THIS ATTACHES ANY SPECIAL TAGS TO THE MOVE
		const conclusion = onlinegame.isValidated(gamefile) ? 'trusted' : message.gameConclusion;
		const moveValidationResult = movevalidation.isOpponentsMoveLegal(gamefile, moveTagged, conclusion); // prettier-ignore

		// Report cheating if the server allows us
		checkAndReportIllegalOpponentMove(gamefile, moveValidationResult, message.move.token, message.moveNumber); // prettier-ignore
		if (!moveValidationResult.valid) return false; // Don't physically play next premove

		// For online games, the server is boss, so its conclusion is the one we adopt.
		movesequence.makeMoveKeepingView(gamefile, mesh, moveValidationResult.tagged, message.gameConclusion); // prettier-ignore

		applyClockValues(gamefile, message.clockValues);

		if (gamefileutility.isGameOver(gamefile)) gameslot.concludeGame();

		GameBus.dispatch('opponent-move-played');

		return true; // Good to physically play next premove
	});

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.
}

/**
 * Logs an illegal opponent move and reports it to the server if the game warrants it.
 *
 * When we can't report it (the checks below), callers still refuse the move, leaving our board a
 * move behind the server's — indefinitely, if nobody else ever reports it. That's intended, not an
 * oversight: forwarding it instead wouldn't agree with a page refresh either, since the initial
 * load replays the move list unvalidated and derives special tags from PSEUDO-legal moves. An
 * illegal castle, for instance, moves the rook on load but couldn't here.
 * @param moveValidationResult - The result of move validation (may be valid or invalid).
 * @param tokenMove - The move in compact string format, used for logging.
 * @param moveNumber - The move number, used for logging.
 */
function checkAndReportIllegalOpponentMove(
	gamefile: GameFile,
	moveValidationResult: MoveValidationResult,
	tokenMove: string,
	moveNumber: number,
): void {
	if (moveValidationResult.valid) return;

	console.log(`Buddy made an illegal play: "${tokenMove}". Reason: ${moveValidationResult.reason} Move number: ${moveNumber}`); // prettier-ignore

	if (gamesession.getRole() === undefined) return; // Spectators never report
	const validated = onlinegame.isValidated(gamefile);
	const engineGame = window.gamePageData.engineGame !== undefined;
	if (!servervalidation.isGameReportable(validated, engineGame)) return;

	reportOpponentsMove(moveValidationResult.reason);
}

/** The move was confirmed illegal, and reportable: Report it. */
function reportOpponentsMove(reason: string): void {
	// Send the move number of the opponents move so that there's no mixup of which move we claim is illegal.
	const opponentsMoveNumber = gameslot.getGamefile()!.moves.length + 1;
	const message = { reason, opponentsMoveNumber };
	void socketsend.send('game', 'report', message);
}

/**
 * Applies received clock values to the game, if provided.
 * MUST ALREADY be ping-adjusted from inside onlinegamerouter.receiveMessage()!
 */
function applyClockValues(gamefile: GameFile, clockValues: ClockValues | undefined): void {
	if (!clockValues) return;
	if (gamefile.untimed) {
		console.warn('Received clock values for untimed game??');
		return;
	}
	clock.edit(gamefile.clocks, clockValues);
	guiclock.edit(gamefile);
}

// Exports ---------------------------------------------------------------------

export default {
	submitMovesFrom,
	handleMove,
	checkAndReportIllegalOpponentMove,
	applyClockValues,
};
