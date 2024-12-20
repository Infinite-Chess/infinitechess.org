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
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guiclock from "../gui/guiclock.js";
// @ts-ignore
import clock from "../../chess/logic/clock.js";

import boardchanges from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";

// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
// @ts-ignore
import type { Move } from "../../chess/util/moveutil.js";

function makeMove(gamefile: gamefile, move: Move, { doGameOverChecks = true, concludeGameIfOver = true} = {}) {

	movepiece.generateMove(gamefile, move);
	movepiece.makeMove(gamefile, move);
	boardchanges.runMove(gamefile, move, meshChanges, true);

	movepiece.updateTurn(gamefile);
	guigameinfo.updateWhosTurn(gamefile);

	if (!onlinegame.areInOnlineGame()) {
		clock.push(gamefile);
		guiclock.push(gamefile);
	}

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		if (concludeGameIfOver && gamefile.gameConclusion && !onlinegame.areInOnlineGame()) game.concludeGame();
	}

	guinavigation.update_MoveButtons();
	stats.setTextContentOfMoves(); // Making a move should change the move number in the stats
	frametracker.onVisualChange();

	arrows.clearListOfHoveredPieces();
}

function animateMove(move: Move, forward = true) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true;
	for (const c of move.changes) {
		if (!(c.action in funcs)) continue;
		funcs[c.action]!(c, clearanimations);
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
	movepiece.gotoMove(gamefile, gamefile.moves.length - 1, (m: Move) => viewMove(gamefile, m, true));
	guinavigation.update_MoveButtons();
	stats.showMoves();
}

function viewMove(gamefile: gamefile, move: Move, forward = true) {
	boardchanges.runMove(gamefile, move, boardchanges.changeFuncs, forward);
	boardchanges.runMove(gamefile, move, meshChanges, forward);
}

function viewIndex(gamefile: gamefile, index: number) {
	movepiece.gotoMove(gamefile, index, (m: Move) => viewMove(gamefile, m, index >= gamefile.moveIndex));
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