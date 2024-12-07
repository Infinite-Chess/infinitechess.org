import gamefileutility from "../../chess/util/gamefileutility";
import onlinegame from "../misc/onlinegame";
import game from "./game";
import arrows from "../rendering/arrows";
import frametracker from "../rendering/frametracker";
import stats from "../gui/stats";
import guinavigation from "../gui/guinavigation";
import moveutil from "../../chess/util/moveutil";
import guigameinfo from "../gui/guigameinfo";
import movepiece from "../../chess/logic/movepiece";

import boardchanges from "../../chess/logic/boardchanges";
import { animatableChanges, meshChanges } from "./graphicalchanges";

// @ts-ignore
import type gamefile from "../../chess/logic/gamefile";

function makeMove(gamefile: gamefile, { doGameOverChecks = true, concludeGameIfOver = true}) {

	movepiece.updateTurn(gamefile, { pushClock: !onlinegame.areInOnlineGame() });

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		if (concludeGameIfOver && gamefile.gameConclusion && !onlinegame.areInOnlineGame()) game.concludeGame();
	}

	guinavigation.update_MoveButtons();
	stats.setTextContentOfMoves(); // Making a move should change the move number in the stats
	frametracker.onVisualChange();

	arrows.clearListOfHoveredPieces();
}

/**
 * Fast-forwards the game to front, to the most-recently played move.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} options - An object containing various options (ALL of these are default *true*):
 * - `flipTurn`: Whether each forwarded move should flip whosTurn. This should be false when forwarding to the game's front after rewinding.
 * - `animateLastMove`: Whether to animate the last move, or most-recently played.
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false if we plan on regenerating the model manually after forwarding.
 * - `updateProperties`: Whether each move should update gamefile properties that game-over algorithms rely on, such as the 50-move-rule's status, or 3-Check's check counter.
 * - `simulated`: Whether you plan on undo'ing this forward, rewinding back to where you were. If true, the `rewindInfo` property will be added to each forwarded move in the gamefile for easy reverting when it comes time.
 */

function forwardToFront(gamefile, { animateLastMove = true } = {}) {

	while (true) { // For as long as we have moves to forward...
		const nextIndex = gamefile.moveIndex + 1;
		if (moveutil.isIndexOutOfRange(gamefile.moves, nextIndex)) break;

		const nextMove = moveutil.getMoveFromIndex(gamefile.moves, nextIndex);

		const isLastMove = moveutil.isIndexTheLastMove(gamefile.moves, nextIndex);
		const animate = animateLastMove && isLastMove;
		makeMove(gamefile, nextMove, { recordMove: false, pushClock: false, doGameOverChecks: false, flipTurn: false, animate, updateData: true, updateProperties:false, simulated: false });
	}

	guigameinfo.updateWhosTurn(gamefile);

	// lock the rewind/forward buttons for a brief moment.
	guinavigation.lockRewind();
}

function animateMoveAtIdx(gamefile: gamefile, moveIdx = gamefile.moveIndex, forward = true) {
	const move = gamefile.moves[moveIdx]
	if (move === undefined) return
	boardchanges.runMove(gamefile, move, animatableChanges, forward)
}

export default {
	makeMove,
	rewindMove,

	viewForward,
	viewBackward,
	viewFront,
	viewIdx,
	animateMoveAtIdx,
};