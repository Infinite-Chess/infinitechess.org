// src/client/scripts/esm/game/misc/onlinegame/resyncer.ts

/**
 * This script handles game updates and recyning an online game,
 * when for one reason or another we become out of sync.
 *
 * Game updates also count as resyncs, because that's what the server
 * sends anyway when we request a resync.
 *
 * This could be because we sent a move at the exact same time
 * the opponent resigned,
 * or it could be because the socket closed...
 */

import type { Mesh } from '../../rendering/piecemodels.js';
import type { FullGame, GameConclusion } from '../../../../../../shared/chess/logic/gamefile.js';
import type {
	GameUpdateMessage,
	ServerGameMoveMessage,
} from '../../../../../../server/game/gamemanager/gameutility.js';

import * as z from 'zod';

import clock from '../../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';

import gameslot from '../../chess/gameslot.js';
import guiclock from '../../gui/guiclock.js';
import premoves from '../../chess/premoves.js';
import selection from '../../chess/selection.js';
import animation from '../../rendering/animation.js';
import onlinegame from './onlinegame.js';
import movesequence from '../../chess/movesequence.js';
import movesendreceive from './movesendreceive.js';
import { animateMove } from '../../chess/graphicalchanges.js';

// Schemas ---------------------------------------------------------------

/** Zod schema for the 'gameupdate' game route action from the server. */
const GameUpdateGameSchema = z.strictObject({
	action: z.literal('gameupdate'),
	value: z.custom<GameUpdateMessage>(),
});

// Functions -----------------------------------------------------------------------------

/**
 * Called when the server sends us the conclusion of the game when it ends,
 * OR we just need to resync! The game may not always be over.
 */
function handleServerGameUpdate(
	gamefile: FullGame,
	mesh: Mesh | undefined,
	message: GameUpdateMessage,
): void {
	const claimedGameConclusion = message.gameConclusion;

	// This needs to be BEFORE synchronizeMovesList(), otherwise it won't resend our move since it thinks we're not in sync
	onlinegame.setInSyncTrue();

	/**
	 * Make sure we are in sync with the final move list.
	 * We need to do this because sometimes the game can end before the
	 * server sees our move, but on our screen we have still played it.
	 */
	const result = synchronizeMovesList(gamefile, mesh, message.moves, claimedGameConclusion); // { opponentPlayedIllegalMove }
	if (result.opponentPlayedIllegalMove) return;

	onlinegame.set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(
		message.participantState,
		message.serverRestartingAt,
	);

	// Must be set before editing the clocks.
	gamefile.basegame.gameConclusion = claimedGameConclusion;

	// Adjust the timer whos turn it is depending on ping.
	if (message.clockValues) {
		if (gamefile.basegame.untimed)
			throw Error('Received clock values in a game update for an untimed game??');
		message.clockValues = onlinegame.adjustClockValuesForPing(message.clockValues);
		clock.edit(gamefile.basegame.clocks, message.clockValues);
		guiclock.edit(gamefile.basegame);
	}

	// For online games, the server is boss, so if they say the game is over, conclude it here.
	if (gamefileutility.isGameOver(gamefile.basegame)) gameslot.concludeGame();
}

/**
 * Adds or deletes moves in the game until it matches the server's provided moves.
 * This can rarely happen when we move after the game is already over,
 * or if we're disconnected when our opponent made their move.
 * THIS CAN EVEN BE CALLED when our moves match the server's!
 * @param gamefile - The gamefile
 * @param moves - The moves list in the most compact form: `['1,2>3,4','5,6>7,8Q']`
 * @param claimedGameConclusion - The supposed game conclusion after synchronizing our opponents move
 * @returns A result object containg the property `opponentPlayedIllegalMove`. If that's true, we'll report it to the server.
 */
function synchronizeMovesList(
	gamefile: FullGame,
	mesh: Mesh | undefined,
	moves: ServerGameMoveMessage[],
	claimedGameConclusion: GameConclusion | undefined,
): { opponentPlayedIllegalMove: boolean } {
	const { boardsim } = gamefile;
	// console.log("Resyncing...");

	// Early exit case. If we have played exactly 1 more move than the server,
	// and the rest of the moves list matches, don't modify our moves,
	// just re-submit our move!
	const hasOneMoreMoveThanServer = boardsim.moves.length === moves.length + 1;
	const finalMoveIsOurMove =
		boardsim.moves.length > 0 &&
		moveutil.getColorThatPlayedMoveIndex(gamefile.basegame, boardsim.moves.length - 1) ===
			onlinegame.getOurColor();
	const previousMove =
		boardsim.moves.length > 1 ? boardsim.moves[boardsim.moves.length - 2] : undefined;
	const previousMoveMatches =
		(moves.length === 0 && boardsim.moves.length === 1) ||
		(boardsim.moves.length > 1 &&
			moves.length > 0 &&
			previousMove!.compact === moves[moves.length - 1]!.compact);
	if (
		!claimedGameConclusion &&
		hasOneMoreMoveThanServer &&
		finalMoveIsOurMove &&
		previousMoveMatches
	) {
		console.log('Sending our move again after resyncing..');
		movesendreceive.sendMove();
		return { opponentPlayedIllegalMove: false };
	}

	const originalMoveIndex = boardsim.state.local.moveIndex;
	movesequence.viewFront(gamefile, mesh);
	let aChangeWasMade = false;

	while (boardsim.moves.length > moves.length) {
		// While we have more moves than what the server does.. (usually only happens if we move RIGHT before they resign)
		premoves.cancelPremoves(gamefile, mesh); // Any move change invalidates all premoves.
		// Terminate all current animations to avoid a crash when undoing moves.
		// Technically this only needs to be done once if rewinding at all.
		animation.clearAnimations();
		movesequence.rewindMove(gamefile, mesh);
		console.log('Rewound one move while resyncing to online game.');
		aChangeWasMade = true;
	}

	let i = moves.length - 1;
	while (true) {
		// Decrement i until we find the latest move at which we're in sync, agreeing with the server about.
		if (i === -1) break; // Beginning of game
		const thisGamefileMove = boardsim.moves[i];
		if (thisGamefileMove) {
			// The move is defined
			if (thisGamefileMove.compact! === moves[i]!.compact) break; // The moves MATCH
			// The moves don't match... remove this one off our list.
			premoves.cancelPremoves(gamefile, mesh); // Any move change invalidates all premoves.
			// Terminate all current animations to avoid a crash when undoing moves.
			// Technically this only needs to be done once if rewinding at all.
			animation.clearAnimations();
			movesequence.rewindMove(gamefile, mesh);
			console.log('Rewound one INCORRECT move while resyncing to online basegame.');
			aChangeWasMade = true;
		}
		i--;
	}

	// i is now the index of the latest move that MATCHES in both ours and the server's moves lists.

	// Unapply premoves before making board changes
	premoves.rewindPremoves(gamefile, mesh);

	const ourColor = onlinegame.getOurColor();
	while (i < moves.length - 1) {
		// Increment i, adding the server's correct moves to our moves list
		i++;

		const thisShortmove = moves[i]!; // '1,2>3,4=Q'  The shortmove from the server's move list to add
		const moveDraft = icnconverter.parseCompactMove(thisShortmove.compact);

		const colorThatPlayedThisMove = moveutil.getColorThatPlayedMoveIndex(gamefile.basegame, i);
		const opponentPlayedThisMove = colorThatPlayedThisMove !== ourColor;

		if (opponentPlayedThisMove) {
			// Perform legality checks
			// If not legal, this will be a string for why it is illegal.
			// THIS ATTACHES ANY SPECIAL FLAGS TO THE MOVE
			const moveValidationResult = movevalidation.isOpponentsMoveLegal(
				gamefile,
				moveDraft,
				claimedGameConclusion,
			);
			if (!moveValidationResult.valid) {
				console.log(
					`Buddy made an illegal play: "${thisShortmove.compact}". Reason: ${moveValidationResult.reason} Move number: ${i + 1}`,
				);
			}
			if (!moveValidationResult.valid && !onlinegame.getIsPrivate()) {
				// Only report cheating in non-private games
				onlinegame.reportOpponentsMove(moveValidationResult.reason);
				// Since we're about to early exit. Be sure to re-apply premoves, then cancel them!
				premoves.applyPremoves(gamefile, mesh);
				premoves.cancelPremoves(gamefile, mesh);
				return { opponentPlayedIllegalMove: true };
			}
		}

		onlinegame.onMovePlayed({ isOpponents: opponentPlayedThisMove });

		const isLastMove = i === moves.length - 1; // Animate only if it's the last move.
		const move = movesequence.makeMove(gamefile, mesh, moveDraft, {
			doGameOverChecks: isLastMove,
		});
		if (isLastMove) animateMove(move.changes, true); // Only animate on the last forwarded move.

		console.log('Forwarded one move while resyncing to online game.');
		aChangeWasMade = true;
	}

	// Whether we call applyPremoves(), or onYourMove() depends on whether it is our turn or not.
	if (ourColor === gamefile.basegame.whosTurn) {
		premoves.onYourMove(gamefile, mesh); // Submits the next premove, if legal, and reapplies the remaining ones.
	} else {
		premoves.applyPremoves(gamefile, mesh); // Doesn't submit the first premove, but reapplies all of them.
	}

	if (!aChangeWasMade) movesequence.viewIndex(gamefile, mesh, originalMoveIndex);
	else selection.reselectPiece(); // Reselect the selected piece from before we resynced. Recalc its moves and recolor it if needed.

	return { opponentPlayedIllegalMove: false }; // No cheating detected
}

export default {
	GameUpdateGameSchema,
	handleServerGameUpdate,
	synchronizeMovesList,
};
