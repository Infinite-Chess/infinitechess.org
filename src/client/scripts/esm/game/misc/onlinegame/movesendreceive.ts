// src/client/scripts/esm/game/misc/onlinegame/movesendreceive.ts

/**
 * This script handles sending our move in online games to the server,
 * and receiving moves from our opponent.
 */

import type { Mesh } from '../../rendering/piecemodels.js';
import type { FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { MoveDraft } from '../../../../../../shared/chess/logic/movepiece.js';
import type { OpponentsMoveMessage } from '../../../../../../server/game/gamemanager/gameutility.js';

import * as z from 'zod';

import clock from '../../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';
import icnconverter, {
	_Move_Compact,
} from '../../../../../../shared/chess/logic/icn/icnconverter.js';

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
import { animateMove } from '../../chess/graphicalchanges.js';

// Schemas ---------------------------------------------------------------

/** Zod schema for the 'move' game route action from the server. */
const MoveGameSchema = z.strictObject({
	action: z.literal('move'),
	value: z.custom<OpponentsMoveMessage>(),
});

export { MoveGameSchema };

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
	const shortmove = lastMove.compact; // "x,y>x,yN"

	const data = {
		move: shortmove,
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
	// Otherwise, we need to re-sync
	const expectedMoveNumber = gamefile.boardsim.moves.length + 1;
	if (message.moveNumber !== expectedMoveNumber) {
		console.error(
			`We have desynced from the game. Resyncing... Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's move: ${JSON.stringify(message.move)}. Move number: ${message.moveNumber}`,
		);
		return onlinegame.resyncToGame();
	}

	// Convert the move from compact short format "x,y>x,y=N" to JSON
	let move_compact: _Move_Compact;
	try {
		move_compact = icnconverter.parseMoveFromShortFormMove(message.move.compact); // { startCoords, endCoords, promotion }
	} catch {
		console.error(
			`Opponent's move is illegal because it isn't in the correct format. Reporting... Move: ${JSON.stringify(message.move.compact)}`,
		);
		const reason = 'Incorrectly formatted.';
		return onlinegame.reportOpponentsMove(reason);
	}

	// Rewind all premoves to get the real game state for legality check
	premoves.rewindPremoves(gamefile, mesh);

	// If not legal, this will be a string for why it is illegal.
	// THIS ATTACHES ANY SPECIAL FLAGS TO THE MOVE
	const moveValidationResult = movevalidation.isOpponentsMoveLegal(
		gamefile,
		move_compact,
		message.gameConclusion,
	);
	if (!moveValidationResult.valid) {
		console.log(
			`Buddy made an illegal play: "${message.move.compact}". Reason: ${moveValidationResult.reason} Move number: ${message.moveNumber}`,
		);
	}
	if (!moveValidationResult.valid && !onlinegame.getIsPrivate()) {
		// Only report cheating in non-private games
		onlinegame.reportOpponentsMove(moveValidationResult.reason);
		// Since we're about to early exit. Be sure to re-apply premoves, then cancel them!
		premoves.applyPremoves(gamefile, mesh);
		premoves.cancelPremoves(gamefile, mesh);
		return;
	}

	// At this stage, the move is legal, or allowed anyway in a private game. Apply it.

	/**
	 * The move draft WITH SPECIAL FLAGS attached!
	 *
	 * Fallback to no special flags if it's an illegal move in a private game (allowed).
	 */
	const moveDraft: MoveDraft = moveValidationResult.valid
		? moveValidationResult.draft
		: move_compact;

	movesequence.viewFront(gamefile, mesh);

	// Forward the move...

	const move = movesequence.makeMove(gamefile, mesh, moveDraft);

	GameBus.dispatch('physical-move');

	if (mesh) animateMove(move.changes, true); // ONLY ANIMATE if the mesh has been generated. It might not be yet if the engine moves extremely fast on turn 1.

	// Edit the clocks

	const { basegame } = gamefile;

	// Adjust the timer whos turn it is depending on ping.
	if (message.clockValues) {
		if (basegame.untimed) throw Error('Received clock values for untimed game??');
		message.clockValues = onlinegame.adjustClockValuesForPing(message.clockValues);
		clock.edit(basegame.clocks, message.clockValues);
		guiclock.edit(basegame);
	}

	// For online games, the server is boss, so if they say the game is over, conclude it here.
	if (gamefileutility.isGameOver(basegame)) gameslot.concludeGame();

	onlinegame.onMovePlayed({ isOpponents: true });
	guipause.onReceiveOpponentsMove(); // Update the pause screen buttons

	// We should probably have this last, since this will make another move AFTER handling our opponent's move here.
	// And it'd be weird to process that move before this opponent's move is fully processed.
	premoves.onYourMove(gamefile, mesh);

	// Must be AFTER premoves.onYourMove(), since that will make a move which may change the selected piece's legal moves AGAIN.
	// NOT TO MENTION reselectPiece() should only be called when the premove's are all applied.
	// Above we premoves.rewindPremoves(), and premoves.onYourMove() applies them again, so this must be after them!
	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.
}

export default {
	sendMove,
	handleOpponentsMove,
};
