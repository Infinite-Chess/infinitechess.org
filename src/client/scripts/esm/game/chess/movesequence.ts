
/**
 * This is a client-side script that executes global and local moves,
 * making both the logical, and graphical changes.
 * 
 * We also have the animate move method here.
 */


import type { FullGame } from "../../../../../shared/chess/logic/gamefile.js";
import type { Edit, Move, MoveDraft} from "../../../../../shared/chess/logic/movepiece.js";


import gameslot from "./gameslot.js";
import guinavigation from "../gui/guinavigation.js";
import boardchanges from "../../../../../shared/chess/logic/boardchanges.js";
import { animateMove, meshChanges } from "./graphicalchanges.js";
import moveutil from "../../../../../shared/chess/util/moveutil.js";
import arrowlegalmovehighlights from "../rendering/arrows/arrowlegalmovehighlights.js";
import piecemodels from "../rendering/piecemodels.js";
import { Mesh } from "../rendering/piecemodels.js";
import gamefileutility from "../../../../../shared/chess/util/gamefileutility.js";
import onlinegame from "../misc/onlinegame/onlinegame.js";
import movepiece from "../../../../../shared/chess/logic/movepiece.js";
import guigameinfo from "../gui/guigameinfo.js";
import guiclock from "../gui/guiclock.js";
import clock from "../../../../../shared/chess/logic/clock.js";
import frametracker from "../rendering/frametracker.js";
// @ts-ignore
import stats from "../gui/stats.js";


// Global Moving ----------------------------------------------------------------------------------------------------------


/**
 * Makes a global forward move in the game. 
 * 
 * This returns the constructed Move object so that we have the option to animate it if we so choose.
 */
function makeMove(gamefile: FullGame, mesh: Mesh | undefined, moveDraft: MoveDraft, { doGameOverChecks = true } = {}): Move {
	const { basegame, boardsim } = gamefile;
	const move = movepiece.generateMove(gamefile, moveDraft);
	
	movepiece.makeMove(gamefile, move); // Logical changes

	if (mesh) runMeshChanges(boardsim, mesh, move, true);
	
	// GUI changes
	updateGui(false);

	if (!onlinegame.areInOnlineGame() && !gamefile.basegame.untimed) {
		const clockStamp_ = clock.push(basegame, basegame.clocks!);
		guiclock.push(basegame.clocks!);
		// Add the clock stamp to the move
		if (clockStamp_ !== undefined) move.clockStamp = clockStamp_;
	}

	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		// Only conclude the game if it's not an online game (in that scenario, server is boss)
		if (gamefileutility.isGameOver(basegame) && !onlinegame.areInOnlineGame()) gameslot.concludeGame();
	}

	// Whenever a move is made in the game, the color of the legal move highlights
	// of the hovered arrows often changes.
	// Erase the list so they can be regenerated next frame with the correct color.
	arrowlegalmovehighlights.reset();

	return move;
}

/**
 * Wrapper for performing the graphical mesh changes of an edit.
 * 
 * If the newlyRegenerated flag is present, indicating the organized pieces were regenerated,
 * than we instead need to regenerate all piece models.
 * Otherwise, we run graphical changes as normal.
 * 
 * We have to regenerate ALL types here, not just the ones whos type ranges
 * were affected, because other pieces may still need graphical changes
 * from the move's changes! For example, pawn deleted that promoted.
 */
function runMeshChanges(boardsim: FullGame["boardsim"], mesh: Mesh, edit: Edit, forward: boolean): void {
	if (boardsim.pieces.newlyRegenerated) piecemodels.regenAll(boardsim, mesh);
	else boardchanges.runChanges(mesh, edit.changes, meshChanges, forward); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
}

/**
 * Makes a global backward move in the game.
 */
function rewindMove(gamefile: FullGame, mesh: Mesh | undefined): void {
	// movepiece.rewindMove() deletes the move, so we need to keep a reference here.
	const lastMove = moveutil.getLastMove(gamefile.boardsim.moves)!;
	movepiece.rewindMove(gamefile); // Logical changes
	if (mesh) boardchanges.runChanges(mesh, lastMove.changes, meshChanges, false); // Graphical changes
	frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	// Un-conclude the game if it was concluded
	if (gamefileutility.isGameOver(gamefile.basegame)) gameslot.unConcludeGame();
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
function viewMove(gamefile: FullGame, mesh: Mesh | undefined, move: Move , forward = true): void {
	movepiece.applyMove(gamefile, move, forward); // Apply the logical changes.
	if (mesh) {
		boardchanges.runChanges(mesh, move.changes, meshChanges, forward); // Apply the graphical changes.
		frametracker.onVisualChange(); // Flag the next frame to be rendered, since we ran some graphical changes.
	}
}

/**
 * Makes the game view a set move index
 * @param index the move index to goto
 */
function viewIndex(gamefile: FullGame, mesh: Mesh | undefined, index: number): void {
	movepiece.goToMove(gamefile.boardsim, index, (move: Move) => viewMove(gamefile, mesh, move, index >= gamefile.boardsim.state.local.moveIndex));
	updateGui(false);
}

/**
 * Makes the game view the last move
 */
function viewFront(gamefile: FullGame, mesh: Mesh | undefined): void {
	/** Call {@link viewIndex} with the index of the last move in the game */
	viewIndex(gamefile, mesh, gamefile.boardsim.moves.length - 1);
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
function navigateMove(gamefile: FullGame, mesh: Mesh | undefined, forward: boolean): void {
	const { boardsim } = gamefile;

	// Determine the index of the move to apply
	const idx = forward ? boardsim.state.local.moveIndex + 1 : boardsim.state.local.moveIndex;

	// Make sure the move exists. Normally we'd never call this method
	// if it does, but just in case we forget to check.
	const move = boardsim.moves[idx];
	if (move === undefined) throw Error(`Move is undefined. Should not be navigating move. forward: ${forward}`);
	
	viewMove(gamefile, mesh, move, forward); // Apply the logical + graphical changes
	animateMove(move.changes, forward); // Animate
	updateGui(true);
}

/**
 * Updates the display of whos turn it is (if it changed),
 * the transparency of the rewind/forward move buttons,
 * updates the move number below the move buttons.
 * @param showMoveCounter Whether to show the move counter below the move buttons in the navigation bar.
 */
function updateGui(showMoveCounter: boolean): void {
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
	runMeshChanges,
};