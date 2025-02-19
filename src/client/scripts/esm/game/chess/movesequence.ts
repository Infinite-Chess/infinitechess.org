
/**
 * This is a client-side script that executes global and local moves,
 * making both the logical, and graphical changes.
 * 
 * We also have the animate move method here.
 */


// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
import type { Move, MoveDraft } from "../../chess/logic/movepiece.js";


import gameslot from "./gameslot.js";
import guinavigation from "../gui/guinavigation.js";
import boardchanges from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";
import moveutil from "../../chess/util/moveutil.js";
// @ts-ignore
import gamefileutility from "../../chess/util/gamefileutility.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame/onlinegame.js";
// @ts-ignore
import arrows from "../rendering/arrows/arrows.js";
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
// @ts-ignore
import frametracker from "../rendering/frametracker.js";
import arrowlegalmovehighlights from "../rendering/arrows/arrowlegalmovehighlights.js";


// Global Moving ----------------------------------------------------------------------------------------------------------


/**
 * Makes a global forward move in the game. 
 * 
 * This returns the constructed Move object so that we have the option to animate it if we so choose.
 */
function makeMove(gamefile: gamefile, moveDraft: MoveDraft, { doGameOverChecks = true } = {}): Move {
	const move = movepiece.generateMove(gamefile, moveDraft);
	movepiece.makeMove(gamefile, move); // Logical changes
	if (gamefile.mesh.model !== undefined) boardchanges.runMove(gamefile, move, meshChanges, true); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	
	// GUI changes
	updateGui(false);

	if (!onlinegame.areInOnlineGame()) {
		clock.push(gamefile);
		guiclock.push(gamefile);
	}

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		// Only conclude the game if it's not an online game (in that scenario, server is boss)
		if (gamefileutility.isGameOver(gamefile) && !onlinegame.areInOnlineGame()) gameslot.concludeGame();
	}

	// Whenever a move is made in the game, the color of the legal move highlights
	// of the hovered arrows often changes.
	// Erase the list so they can be regenerated next frame with the correct color.
	arrowlegalmovehighlights.reset();

	return move;
}

/**
 * Makes a global backward move in the game.
 */
function rewindMove(gamefile: gamefile) {
	// movepiece.rewindMove() deletes the move, so we need to keep a reference here.
	const lastMove = moveutil.getLastMove(gamefile.moves)!;
	movepiece.rewindMove(gamefile); // Logical changes
	boardchanges.runMove(gamefile, lastMove, meshChanges, false); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	// Un-conclude the game if it was concluded
	if (gamefileutility.isGameOver(gamefile)) gameslot.unConcludeGame();
	updateGui(false); // GUI changes
}


// Local Moving ----------------------------------------------------------------------------------------------------------


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
	movepiece.applyMove(gamefile, move, forward); // Apply the logical changes.
	boardchanges.runMove(gamefile, move, meshChanges, forward); // Apply the graphical changes.
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
}

/**
 * Makes the game view a set move index
 * @param gamefile the gamefile
 * @param index the move index to goto
 */
function viewIndex(gamefile: gamefile, index: number) {
	movepiece.goToMove(gamefile, index, (move: Move) => viewMove(gamefile, move, index >= gamefile.moveIndex));
	updateGui(false);
}

/**
 * Makes the game view the last move
 */
function viewFront(gamefile: gamefile) {
	/** Call {@link viewIndex} with the index of the last move in the game */
	viewIndex(gamefile, gamefile.moves.length - 1);
}

/**
 * Called when we hit the left/right arrows keys,
 * or click the rewind/forward move buttons.
 * 
 * This VIEWS the next move, whether forward or backward,
 * makes the graphical (mesh) changes, animates it, and updates the GUI.
 * 
 * ASSUMES that it is legal to navigate in the direction.
 */
function navigateMove(gamefile: gamefile, forward: boolean): void {
	// Determine the index of the move to apply
	const idx = forward ? gamefile.moveIndex + 1 : gamefile.moveIndex;

	// Make sure the move exists. Normally we'd never call this method
	// if it does, but just in case we forget to check.
	const move = gamefile.moves[idx];
	if (move === undefined) throw Error(`Move is undefined. Should not be navigating move. forward: ${forward}`);
	
	viewMove(gamefile, move, forward); // Apply the logical + graphical changes
	animateMove(move, forward); // Animate
	updateGui(true);
}


// Animating ---------------------------------------------------------------------------------------------------------------


/**
 * Animates a given move.
 * We don't use boardchanges because custom functionality is needed.
 * @param move the move to animate
 * @param forward whether this is a forward or back animation
 * @param animateMain Whether the main piece targeted by the move should be animated. All secondary pieces are guaranteed animated. If this is false, the main piece animation will be instantanious, only playing the SOUND.
 */
function animateMove(move: Move, forward = true, animateMain = true) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true; // The first animation of a turn should clear prev turns animation

	// TODO: figure out a way to animate multiple moves of the same piece
	// Keyframing or smth

	// How does the rose animate?
	for (const change of move.changes) {
		if (!(change.action in funcs)) continue; // There is no animation change function for this type of Change
		const instant = change.main && !animateMain; // Whether the animation should be instantanious, only playing the SOUND.
		funcs[change.action]!(change, instant, clearanimations); // Call the animation function
		clearanimations = false;
	}
}

/**
 * Updates the display of whos turn it is (if it changed),
 * the transparency of the rewind/forward move buttons,
 * updates the move number below the move buttons.
 * @param showMoveCounter Whether to show the move counter below the move buttons in the navigation bar.
 */
function updateGui(showMoveCounter: boolean) {
	if (showMoveCounter) stats.showMoves();
	else stats.updateTextContentOfMoves(); // While we may not be OPENING the move counter, if it WAS already open we should still update the number!
	guinavigation.update_MoveButtons();
	guigameinfo.updateWhosTurn();
}


// --------------------------------------------------------------------------------------------------------------------------


export default {
	navigateMove,
	makeMove,
	rewindMove,
	viewMove,
	viewFront,
	viewIndex,
	animateMove,
};