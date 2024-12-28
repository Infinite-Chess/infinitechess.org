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
// @ts-ignore
import coordutil from "../../chess/util/coordutil.js";

import state from "../../chess/logic/state.js";
import boardchanges from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";

// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
// @ts-ignore
import type { Move } from "../../chess/util/moveutil.js";

/**
 * The universal move function for the client's game.
 * 
 * @param gamefile the gamefile
 * @param move 
 * @param options
 */
function makeMove(gamefile: gamefile, move: Move, { doGameOverChecks = true, concludeGameIfOver = true} = {}) {
	movepiece.generateMove(gamefile, move);
	movepiece.makeMove(gamefile, move);
	boardchanges.runMove(gamefile, move, meshChanges, true);

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

/**
 * Animates a given move.
 * We don't use boardchanges because custom functionality is needed.
 * @param move the move to animate
 * @param forward whether this is a forward or back animation
 */
function animateMove(move: Move, forward = true, animateMain = true) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true; // The first animation of a turn should clear prev turns animation
	// TODO: figure out a way to animate multiple moves of the same piece
	// Keyframing or smth

	let mainCoords = move.startCoords;

	// How does the rose animate?
	for (const c of move.changes) {
		if (!(c.action in funcs)) continue;
		if (!animateMain && c['piece'].type === move.type) {
			if (coordutil.getKeyFromCoords(c['piece'].coords) === coordutil.getKeyFromCoords(mainCoords)) {
				mainCoords = c['endCoords'];
				continue;
			}
		}
		funcs[c.action]!(c, clearanimations);
		clearanimations = false;
	}
}

/**
 * Updates turn gui elements and updates check highlights whenever we look at a different turn.
 * @param gamefile the gamefile
 */
function updateGui(): void {
	guinavigation.update_MoveButtons();
	stats.showMoves();
	frametracker.onVisualChange();
}

/**
 * 
 * @param gamefile 
 */
function rewindMove(gamefile: gamefile) {
	boardchanges.runMove(gamefile, gamefile.moves[gamefile.moveIndex], meshChanges, false);
	movepiece.rewindMove(gamefile);
	updateGui();
}

/**
 * Makes the game view the last move
 * @param gamefile 
 */
function viewFront(gamefile: gamefile) {
	movepiece.gotoMove(gamefile, gamefile.moves.length - 1, (m: Move) => viewMove(gamefile, m, true));
	updateGui();
}

/**
 * Apply the move to the board state and the mesh
 * @param gamefile 
 * @param move 
 * @param forward 
 */
function viewMove(gamefile: gamefile, move: Move, forward = true) {
	boardchanges.runMove(gamefile, move, boardchanges.changeFuncs, forward);
	boardchanges.runMove(gamefile, move, meshChanges, forward);
	state.applyMove(gamefile, move, forward);
}

/**
 * Makes the game veiw a set move index
 * @param gamefile the gamefile
 * @param index the move index to goto
 */
function viewIndex(gamefile: gamefile, index: number) {
	movepiece.gotoMove(gamefile, index, (m: Move) => viewMove(gamefile, m, index >= gamefile.moveIndex));
	updateGui();
}

function navigateMove(gamefile: gamefile, forward: boolean): void {
	const idx = forward ? gamefile.moveIndex++ + 1 : gamefile.moveIndex--; // change move index and get the idx of the move we are supposed to apply
	viewMove(gamefile, gamefile.moves[idx], forward);
	animateMove(gamefile.moves[idx], forward);
	updateGui();
}

export default {
	navigateMove,
	makeMove,
	rewindMove,
	viewMove,
	viewFront,
	viewIndex,
	animateMove,
};