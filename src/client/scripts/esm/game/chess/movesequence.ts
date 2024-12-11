// @ts-ignore
import gamefileutility from "../../chess/util/gamefileutility.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame.js";
// @ts-ignore
import game from "./game.js";
// @ts-ignore
import arrows from "../rendering/arrows.js";
// @ts-ignore
import frametracker from "../rendering/frametracker.js";
// @ts-ignore
import stats from "../gui/stats.js";
// @ts-ignore
import guinavigation from "../gui/guinavigation.js";
// @ts-ignore
import movepiece from "../../chess/logic/movepiece.js";

import boardchanges from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";

// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
// @ts-ignore
import type { Move } from "../../chess/util/moveutil.js";

function makeMove(gamefile: gamefile, move: Move, { doGameOverChecks = true, concludeGameIfOver = true} = {}) {

	movepiece.generateMove(gamefile, move);
	movepiece.makeMove(gamefile, move);
	movepiece.updateTurn(gamefile, { pushClock: !onlinegame.areInOnlineGame() });
	boardchanges.runMove(gamefile, move, meshChanges, true);

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		if (concludeGameIfOver && gamefile.gameConclusion && !onlinegame.areInOnlineGame()) game.concludeGame();
	}

	guinavigation.update_MoveButtons();
	stats.setTextContentOfMoves(); // Making a move should change the move number in the stats
	frametracker.onVisualChange();

	arrows.clearListOfHoveredPieces();
}

function animateMove(gamefile: gamefile, move: Move, forward = true) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true;
	for (const c of move.changes) {
		if (c.action) continue;
		if (!(c.action in funcs)) continue;
		// @ts-ignore
		funcs[c.action](c, clearanimations);
		clearanimations = false;
	}
}

function rewindMove(gamefile: gamefile) {
	boardchanges.runMove(gamefile, gamefile.moves[gamefile.moveIndex], meshChanges, false);
	movepiece.rewindMove(gamefile);
	guinavigation.update_MoveButtons();
	frametracker.onVisualChange();
}

function viewFront(gamefile: gamefile) {
	movepiece.forEachMove(gamefile, gamefile.moves.length - 1, (m: Move) => viewMove(gamefile, m, true));
	gamefile.moveIndex = gamefile.moves.length - 1;
	guinavigation.update_MoveButtons();
	stats.showMoves();
}

function viewMove(gamefile: gamefile, move: Move, forward = true) {
	boardchanges.runMove(gamefile, move, boardchanges.changeFuncs, forward);
	boardchanges.runMove(gamefile, move, meshChanges, forward);
}

function viewIndex(gamefile: gamefile, index: number) {
	movepiece.forEachMove(gamefile, index, (m: Move) => viewMove(gamefile, m, index >= gamefile.moveIndex));
	gamefile.moveIndex = index;
	guinavigation.update_MoveButtons();
	stats.showMoves();
}

export default {
	makeMove,
	rewindMove,
	viewMove,
	viewFront,
	viewIndex,
	animateMove,
};