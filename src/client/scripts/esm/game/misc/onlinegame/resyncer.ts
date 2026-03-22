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
import type { FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { GameConclusion } from '../../../../../../shared/chess/util/winconutil.js';
import type { MoveRecord, MoveTagged } from '../../../../../../shared/chess/logic/movepiece.js';
import type { GameUpdateMessage, MovePacket } from '../../../../../../shared/types.js';

import moveutil from '../../../../../../shared/chess/util/moveutil.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import movevalidation from '../../../../../../shared/chess/logic/movevalidation.js';
import gamefileutility from '../../../../../../shared/chess/util/gamefileutility.js';

import gameslot from '../../chess/gameslot.js';
import premoves from '../../chess/premoves.js';
import guipause from '../../gui/guipause.js';
import selection from '../../chess/selection.js';
import onlinegame from './onlinegame.js';
import movesequence from '../../chess/movesequence.js';
import movesendreceive from './movesendreceive.js';

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
	const result = synchronizeMovesList(
		gamefile,
		mesh,
		message.moves,
		claimedGameConclusion,
		message.forceSync,
	); // { opponentPlayedIllegalMove }
	if (result.opponentPlayedIllegalMove) return;

	onlinegame.set_DrawOffers_DisconnectInfo_AutoAFKResign(message.participantState);

	// Must be set before editing the clocks.
	gamefileutility.setConclusion(gamefile.basegame, claimedGameConclusion);

	// Adjust the timer whos turn it is depending on ping.
	movesendreceive.applyClockValues(gamefile, message.clockValues);

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
 * @param forceSync - If true, skip the early-exit re-submit path and force our move list to exactly match the server's
 * @returns A result object containg the property `opponentPlayedIllegalMove`. If that's true, we'll report it to the server.
 */
function synchronizeMovesList(
	gamefile: FullGame,
	mesh: Mesh | undefined,
	moves: MovePacket[],
	claimedGameConclusion: GameConclusion | undefined,
	forceSync: boolean,
): { opponentPlayedIllegalMove: boolean } {
	const { boardsim } = gamefile;
	// console.log("Resyncing...");

	// Early exit case. If we have played exactly 1 more move than the server,
	// and the rest of the moves list matches, don't modify our moves,
	// just re-submit our move!
	// Skip this if forceSync is set — the server wants us to match its state exactly
	// (e.g. it rejected our last move as illegal).
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
			previousMove!.token === moves[moves.length - 1]!.token);
	if (
		!forceSync &&
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

	/** The index of the lastest move in the game we agree with the server on. -1 = starting position. */
	const latestMatchingMoveIndex = findLastestMatchingMoveIndex(boardsim.moves, moves);

	// Rewind moves until we reach the first move we agree with the server on.
	// Catches our move if we moved RIGHT after the game ended but we haven't seen the conclusion.
	for (let i = boardsim.moves.length - 1; i > latestMatchingMoveIndex; i--) {
		console.log(`Rewinding move index ${i} while resyncing to online game.`);
		movesequence.rewindMove(gamefile, mesh);
		aChangeWasMade = true;
	}

	let opponentPlayedIllegalMove: boolean = false;
	/** Whether or not we forwarded at least one of OUR OWN moves the server had that we didn't. */
	let atleastOneOfOurMovesWasForwarded: boolean = false;

	// Forward moves until we perfectly match the server's moves list.
	premoves.performWithUnapplied(gamefile, mesh, () => {
		const ourColor = onlinegame.getOurColor();
		for (let i = latestMatchingMoveIndex + 1; i < moves.length; i++) {
			// Incrementally add the server's correct moves to our own moves list
			const isLastMove = i === moves.length - 1;
			const playerOfMove = moveutil.getColorThatPlayedMoveIndex(gamefile.basegame, i);
			const isOpponentMove = playerOfMove !== ourColor;

			const thisShortmove = moves[i]!; // '1,2>3,4=Q'  The shortmove from the server's move list to add
			// Convert the move from compact short format "x,y>x,y=N" to JSON.
			// Gauranteed by the server to be parsable.
			const moveTagged: MoveTagged = icnconverter.parseTokenMove(thisShortmove.token);

			if (isOpponentMove) {
				// Perform legality checks
				// THIS ATTACHES ANY SPECIAL TAGS TO THE MOVE
				const moveValidationResult = movevalidation.isOpponentsMoveLegal(
					gamefile,
					moveTagged,
					claimedGameConclusion,
				);
				// Only report cheating in games where the server won't delete the game instantly when it ends
				if (
					movesendreceive.checkAndReportIllegalOpponentMove(
						gamefile,
						moveValidationResult,
						thisShortmove.token,
						i + 1,
					)
				) {
					opponentPlayedIllegalMove = true;
					return false; // Don't physically play next premove
				}
			} else {
				atleastOneOfOurMovesWasForwarded = true;
			}

			movesequence.makeMoveAndAnimate(gamefile, mesh, moveTagged, {
				doGameOverChecks: isLastMove,
			}); // Automatically cancels animations of forwarded moves in previous loops

			onlinegame.onMovePlayed({ isOpponents: isOpponentMove });
			if (isOpponentMove) guipause.onReceiveOpponentsMove(); // Update the pause screen buttons

			console.log('Forwarded one move while resyncing to online game.');
			aChangeWasMade = true;
		}

		// Whether we're good to physically play the next premove depends on whether it is our turn or not,
		// AND whether we forwarded at least one of our own moves that the server had that we didn't.
		if (!atleastOneOfOurMovesWasForwarded && ourColor === gamefile.basegame.whosTurn) {
			return true; // Good to physically play next premove
		} else {
			return false; // Don't physically play next premove
		}
	});

	// If we happened to forward one of our own moves forwarded (not sure when our state
	// would be so behind to inherit this), then also cancel all premoves we had.
	if (atleastOneOfOurMovesWasForwarded) premoves.cancelPremoves(gamefile, mesh);

	if (opponentPlayedIllegalMove) return { opponentPlayedIllegalMove: true };

	if (!aChangeWasMade) movesequence.viewIndex(gamefile, mesh, originalMoveIndex);
	else selection.reselectPiece(); // Reselect the selected piece from before we resynced. Recalc its moves and recolor it if needed.

	return { opponentPlayedIllegalMove: false }; // No cheating detected
}

/**
 * Finds the latest move index at which our moves and the server's moves match. Returns -1 if we only agree on the starting position.
 * @param ourMoves - Our moves list in compact form: `['1,2>3,4','5,6>7,8Q']`
 * @param serverMoves - The server's moves list in compact form: `[{ token: '1,2>3,4' }, { token: '5,6>7,8Q' }]`
 */
function findLastestMatchingMoveIndex(ourMoves: MoveRecord[], serverMoves: MovePacket[]): number {
	if (ourMoves.length === 0) return -1; // We only agree with the starting position
	for (let i = 0; i < ourMoves.length; i++) {
		if (ourMoves[i]!.token !== serverMoves[i]?.token) return i - 1; // We agree up to the previous move, but not this one
	}
	return ourMoves.length - 1; // We agree with all
}

// Exports -------------------------------------------------------------------

export default {
	handleServerGameUpdate,
};
