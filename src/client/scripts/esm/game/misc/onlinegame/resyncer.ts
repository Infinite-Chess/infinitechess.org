
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


import type { MoveDraft } from "../../../chess/logic/movepiece.js";
import type { GameUpdateMessage } from "./onlinegamerouter.js";
// @ts-ignore
import type gamefile from "../../../chess/logic/gamefile.js";


import movesendreceive from "./movesendreceive.js";
import onlinegame from "./onlinegame.js";
import clock from "../../../chess/logic/clock.js";
import gamefileutility from "../../../chess/util/gamefileutility.js";
import gameslot from "../../chess/gameslot.js";
// @ts-ignore
import legalmoves from "../../../chess/logic/legalmoves.js";
// @ts-ignore
import moveutil from "../../../chess/util/moveutil.js";
// @ts-ignore
import selection from "../../chess/selection.js";
// @ts-ignore
import formatconverter from "../../../chess/logic/formatconverter.js";
import movesequence from "../../chess/movesequence.js";


// Functions -----------------------------------------------------------------------------


/**
 * Called when the server sends us the conclusion of the game when it ends,
 * OR we just need to resync! The game may not always be over.
 */
function handleServerGameUpdate(gamefile: gamefile, message: GameUpdateMessage) {
	const claimedGameConclusion = message.gameConclusion;

	// This needs to be BEFORE synchronizeMovesList(), otherwise it won't resend our move since it thinks we're not in sync
	onlinegame.setInSyncTrue();

	/**
     * Make sure we are in sync with the final move list.
     * We need to do this because sometimes the game can end before the
     * server sees our move, but on our screen we have still played it.
     */
	const result = synchronizeMovesList(gamefile, message.moves, claimedGameConclusion); // { opponentPlayedIllegalMove }
	if (result.opponentPlayedIllegalMove) return;

	onlinegame.set_DrawOffers_DisconnectInfo_AutoAFKResign_ServerRestarting(message);

	// Must be set before editing the clocks.
	gamefile.gameConclusion = claimedGameConclusion;

	// Adjust the timer whos turn it is depending on ping.
	if (message.clockValues) message.clockValues = clock.adjustClockValuesForPing(message.clockValues);
	clock.edit(gamefile, message.clockValues);

	// For online games, the server is boss, so if they say the game is over, conclude it here.
	if (gamefileutility.isGameOver(gamefile)) gameslot.concludeGame();
}


/**
 * Adds or deletes moves in the game until it matches the server's provided moves.
 * This can rarely happen when we move after the game is already over,
 * or if we're disconnected when our opponent made their move.
 * @param gamefile - The gamefile
 * @param moves - The moves list in the most compact form: `['1,2>3,4','5,6>7,8Q']`
 * @param claimedGameConclusion - The supposed game conclusion after synchronizing our opponents move
 * @returns A result object containg the property `opponentPlayedIllegalMove`. If that's true, we'll report it to the server.
 */
function synchronizeMovesList(gamefile: gamefile, moves: string[], claimedGameConclusion: string | false): { opponentPlayedIllegalMove: boolean } {
	// console.log("Resyncing...");

	// Early exit case. If we have played exactly 1 more move than the server,
	// and the rest of the moves list matches, don't modify our moves,
	// just re-submit our move!
	const hasOneMoreMoveThanServer = gamefile.moves.length === moves.length + 1;
	const finalMoveIsOurMove = gamefile.moves.length > 0 && moveutil.getColorThatPlayedMoveIndex(gamefile, gamefile.moves.length - 1) === onlinegame.getOurColor();
	const previousMoveMatches = (moves.length === 0 && gamefile.moves.length === 1) || gamefile.moves.length > 1 && moves.length > 0 && gamefile.moves[gamefile.moves.length - 2].compact === moves[moves.length - 1];
	if (!claimedGameConclusion && hasOneMoreMoveThanServer && finalMoveIsOurMove && previousMoveMatches) {
		console.log("Sending our move again after resyncing..");
		movesendreceive.sendMove();
		return { opponentPlayedIllegalMove: false };
	}

	const originalMoveIndex = gamefile.moveIndex;
	movesequence.viewFront(gamefile);
	let aChangeWasMade = false;

	while (gamefile.moves.length > moves.length) { // While we have more moves than what the server does..
		movesequence.rewindMove(gamefile);
		console.log("Rewound one move while resyncing to online game.");
		aChangeWasMade = true;
	}

	let i = moves.length - 1;
	while (true) { // Decrement i until we find the latest move at which we're in sync, agreeing with the server about.
		if (i === -1) break; // Beginning of game
		const thisGamefileMove = gamefile.moves[i];
		if (thisGamefileMove) { // The move is defined
			if (thisGamefileMove.compact === moves[i]) break; // The moves MATCH
			// The moves don't match... remove this one off our list.
			movesequence.rewindMove(gamefile);
			console.log("Rewound one INCORRECT move while resyncing to online game.");
			aChangeWasMade = true;
		}
		i--;
	}

	// i is now the index of the latest move that MATCHES in both ours and the server's moves lists.

	const opponentColor = onlinegame.getOpponentColor();
	while (i < moves.length - 1) { // Increment i, adding the server's correct moves to our moves list
		i++;
		const thisShortmove = moves[i]; // '1,2>3,4Q'  The shortmove from the server's move list to add
		const moveDraft: MoveDraft = formatconverter.ShortToLong_CompactMove(thisShortmove) as MoveDraft;

		const colorThatPlayedThisMove = moveutil.getColorThatPlayedMoveIndex(gamefile, i);
		const opponentPlayedThisMove = colorThatPlayedThisMove === opponentColor;


		if (opponentPlayedThisMove) { // Perform legality checks
			// If not legal, this will be a string for why it is illegal.
			const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile, moveDraft, claimedGameConclusion);
			if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${thisShortmove} ${claimedGameConclusion}`);
			if (moveIsLegal !== true && !onlinegame.getIsPrivate()) { // Allow illegal moves in private games
				onlinegame.reportOpponentsMove(moveIsLegal);
				return { opponentPlayedIllegalMove: true };
			}
		}

		onlinegame.onMovePlayed({ isOpponents: opponentPlayedThisMove });
        
		const isLastMove = i === moves.length - 1;		// Animate only if it's the last move.
		const move = movesequence.makeMove(gamefile, moveDraft, { doGameOverChecks: isLastMove});
		if (isLastMove) movesequence.animateMove(move, true); // Only animate on the last forwarded move.

		console.log("Forwarded one move while resyncing to online game.");
		aChangeWasMade = true;
	}

	if (!aChangeWasMade) movesequence.viewIndex(gamefile, originalMoveIndex);
	else selection.reselectPiece(); // Reselect the selected piece from before we resynced. Recalc its moves and recolor it if needed.

	return { opponentPlayedIllegalMove: false }; // No cheating detected
}



export default {
	handleServerGameUpdate,
	synchronizeMovesList,
};