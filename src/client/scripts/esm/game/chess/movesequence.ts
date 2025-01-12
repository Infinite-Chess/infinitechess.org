
/**
 * This script handles executing global moves, local moves, and animating moves.
 * 
 * This is a client-side script, as the server has no need to animate anything.
 */


// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
import type { Move, MoveDraft } from "../../chess/logic/movepiece.js";

import coordutil from "../../chess/util/coordutil.js";
import gameslot from "./gameslot.js";
import guinavigation from "../gui/guinavigation.js";
import boardchanges from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";
// @ts-ignore
import gamefileutility from "../../chess/util/gamefileutility.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame.js";
// @ts-ignore
import arrows from "../rendering/arrows.js";
// @ts-ignore
import stats from "../gui/stats.js";
// @ts-ignore
import movepiece from "../../chess/logic/movepiece.js";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guiclock from "../gui/guiclock.js";
// @ts-ignore
import clock from "../../chess/logic/clock.js";


// Global Moving ----------------------------------------------------------------------------------------------------------


/**
 * Makes a global forward move in the game. 
 * 
 * This returns the constructed Move object so that we have the option to animate it if we so choose.
 */
function makeMove(gamefile: gamefile, moveDraft: MoveDraft, { doGameOverChecks = true } = {}): Move {
	const move = movepiece.generateMove(gamefile, moveDraft);
	movepiece.makeMove(gamefile, move);
	boardchanges.runMove(gamefile, move, meshChanges, true);

	guigameinfo.updateWhosTurn(gamefile);

	if (!onlinegame.areInOnlineGame()) {
		clock.push(gamefile);
		guiclock.push(gamefile);
	}

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		if (gamefileutility.isGameOver(gamefile) && !onlinegame.areInOnlineGame()) gameslot.concludeGame();
	}

	updateGui(false);

	arrows.clearListOfHoveredPieces();

	return move;
}

/** Makes a global backward move in the game. */
function rewindMove(gamefile: gamefile) {
	// Make the logical changes
	movepiece.rewindMove(gamefile);
	// Make the mesh changes
	boardchanges.runMove(gamefile, gamefile.moves[gamefile.moveIndex], meshChanges, false);
	// Make the gui changes
	updateGui(false);
}





// Local Moving ----------------------------------------------------------------------------------------------------------





/**
 * Makes the game view the last move
 */
function viewFront(gamefile: gamefile, { animateLastMove }: { animateLastMove: boolean }) {
	// TODO: What happens if we try to view front when we're already at front?
	movepiece.gotoMove(gamefile, gamefile.moves.length - 1, (move: Move) => viewMove(gamefile, move, true));
	if (animateLastMove) animateMove(gamefile.moves[gamefile.moveIndex]);
	updateGui(false);
}

/**
 * Apply the move to the board state and the mesh, whether forward or backward,
 * as if we were wanting to *view* the move, instead of making it.
 * 
 * This does not change the game state, for example, whos turn it is,
 * what square enpassant is legal on, or the running count of checks given.
 * 
 * But it does change the check state.
 */
function viewMove(gamefile: gamefile, move: Move, forward = true) {
	// TODO:
	// Rename to make it clear this forwards/rewinds a LOCAL move.
	movepiece.applyMove(gamefile, move, forward);
	boardchanges.runMove(gamefile, move, meshChanges, forward);
}

/**
 * Called when we hit the left/right arrows keys,
 * or click the rewind/forward move buttons.
 * 
 * This VIEWS the next move, whether forward or backward,
 * animates it,
 * and updates the GUI stuff.
 */
function navigateMove(gamefile: gamefile, forward: boolean): void {
	// Determine the index of the move to apply
	const idx = forward ? gamefile.moveIndex + 1 : gamefile.moveIndex;

	// Adjust move index based on direction
	if (forward) gamefile.moveIndex++;
	else gamefile.moveIndex--;

	viewMove(gamefile, gamefile.moves[idx], forward);
	animateMove(gamefile.moves[idx], forward);
	updateGui(true);
}

/**
 * Makes the game veiw a set move index
 * @param gamefile the gamefile
 * @param index the move index to goto
 */
function viewIndex(gamefile: gamefile, index: number) {
	movepiece.gotoMove(gamefile, index, (m: Move) => viewMove(gamefile, m, index >= gamefile.moveIndex));
	updateGui(false);
}



// Animating ---------------------------------------------------------------------------------------------------------------


/**
 * Animates a given move.
 * We don't use boardchanges because custom functionality is needed.
 * @param move the move to animate
 * @param forward whether this is a forward or back animation
 * @param animateMain Whether the targeted piece should be animated. All secondary pieces are guaranteed affected.
 */
function animateMove(move: Move, forward = true, animateMain = true) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true; // The first animation of a turn should clear prev turns animation
	// TODO: figure out a way to animate multiple moves of the same piece
	// Keyframing or smth

	let mainCoords = move.startCoords;

	// How does the rose animate?
	for (const change of move.changes) {
		if (!(change.action in funcs)) continue;
		if (!animateMain && change['piece'].type === move.type) {
			if (coordutil.getKeyFromCoords(change['piece'].coords) === coordutil.getKeyFromCoords(mainCoords)) {
				mainCoords = change['endCoords'];
				continue;
			}
		}
		funcs[change.action]!(change, clearanimations);
		clearanimations = false;
	}
}

/**
 * Updates the transparency of the rewind/forward move buttons,
 * updates the move number below the move buttons,
 * and flags the next frame to be rendered.
 * @param showMoveCounter Whether to show the move counter below the move buttons in the navigation bar.
 */
function updateGui(showMoveCounter: boolean) {
	if (showMoveCounter) stats.showMoves();
	else stats.updateTextContentOfMoves(); // While we may not be OPENING the move counter, if it WAS already open we should still update the number!
	guinavigation.update_MoveButtons();
	// frametracker.onVisualChange();
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