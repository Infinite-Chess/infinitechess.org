
/**
 * This script handles executing global moves, local moves, and animating moves.
 * 
 * This is a client-side script, as the server has no need to animate anything.
 */


// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";
import type { MoveState } from "../../chess/logic/state.js";


import coordutil, { Coords } from "../../chess/util/coordutil.js";
import gameslot from "./gameslot.js";
import guinavigation from "../gui/guinavigation.js";
import boardchanges, { Change } from "../../chess/logic/boardchanges.js";
import { animatableChanges, meshChanges } from "./graphicalchanges.js";
// @ts-ignore
import gamefileutility from "../../chess/util/gamefileutility.js";
// @ts-ignore
import onlinegame from "../misc/onlinegame.js";
// @ts-ignore
import arrows from "../rendering/arrows.js";
// @ts-ignore
import frametracker from "../rendering/frametracker.js";
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
import formatconverter from "../../chess/logic/formatconverter.js";




/** What a move looks like, before movepiece.js creates the `changes`, `state`, `compact`, and `generateIndex` properties on it. */
interface MoveDraft {
	startCoords: Coords,
	endCoords: Coords,
	/** Present if the move was special-move enpassant capture. This will be
	 * 1 for the captured piece is 1 square above, or -1 for 1 square below. */
	enpassant?: -1 | 1,
	/** Present if the move was a special-move promotion. This will be
	 * a string of the type of piece being promoted to: "queensW" */
	promotion?: string,
	/** Present if the move was a special-move casle. This may look like an
	 * object: `{ coord, dir }` where `coord` is the starting coordinates of the
	 * rook being castled with, and `dir` is the direction castled, 1 for right and -1 for left. */
	castle?: { coord: Coords, dir: 1 | -1 },
}

/**
 * Contains all properties a {@link MoveDraft} has, and more!
 * Including the changes it made to the board, the gamefile
 * state before and after the move, etc.
 */
interface Move extends MoveDraft {
	/** The type of piece moved */
	type: string,
	/** A list of changes the move made to the board, whether it moved a piece, captured a piece, added a piece, etc. */
	changes: Array<Change>,
	/** The state of the move is used to know how to modify specific gamefile
	 * properties when forwarding/rewinding this move. */
	state: MoveState,
	generateIndex: number,
	/** The move in most compact notation: `8,7>8,8Q` */
	compact: string,
	/** Whether the move delivered check. */
	check: boolean,
	/** Whether the move delivered mate (or the killing move). */
	mate: boolean,
}

	

// Global Moving ----------------------------------------------------------------------------------------------------------



/** Makes a global forward move in the game. */
function makeMove(
	gamefile: gamefile,
	moveDraft: MoveDraft,
	{
		animationLevel = 2,
		doGameOverChecks = true,
		concludeGameIfOver = true,
	}: {
		/**  0 = No animation.  1 = Animate only secondary pieces.  2 = Animate all.  */
		animationLevel?: 0 | 1 | 2,
		updateMesh?: boolean,
		doGameOverChecks?: boolean,
		concludeGameIfOver?: boolean,
	} = {}
) {
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
		if (concludeGameIfOver && gamefileutility.isGameOver(gamefile) && !onlinegame.areInOnlineGame()) gameslot.concludeGame();
	}

	updateGui({ showMoveCounter: false });

	arrows.clearListOfHoveredPieces();

	if (animationLevel !== 0) animateMove(move, true, animationLevel);
}

/** Makes a global backward move in the game. */
function rewindMove(gamefile: gamefile) {
	// Make the logical changes
	movepiece.rewindMove(gamefile);
	// Make the mesh changes
	boardchanges.runMove(gamefile, gamefile.moves[gamefile.moveIndex], meshChanges, false);
	// Make the gui changes
	updateGui({ showMoveCounter: false });
}





// Local Moving ----------------------------------------------------------------------------------------------------------





/**
 * Makes the game view the last move
 */
function viewFront(gamefile: gamefile, { animateLastMove }: { animateLastMove: boolean }) {
	// TODO: What happens if we try to view front when we're already at front?
	movepiece.gotoMove(gamefile, gamefile.moves.length - 1, (move: Move) => viewMove(gamefile, move, true));
	if (animateLastMove) animateMove(gamefile.moves[gamefile.moveIndex]);
	updateGui({ showMoveCounter: false });
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
	updateGui({ showMoveCounter: true });
}

/**
 * Makes the game veiw a set move index
 * @param gamefile the gamefile
 * @param index the move index to goto
 */
function viewIndex(gamefile: gamefile, index: number) {
	movepiece.gotoMove(gamefile, index, (m: Move) => viewMove(gamefile, m, index >= gamefile.moveIndex));
	updateGui({ showMoveCounter: false });
}



// Animating ---------------------------------------------------------------------------------------------------------------


/**
 * Animates a given move.
 * We don't use boardchanges because custom functionality is needed.
 * @param move the move to animate
 * @param forward whether this is a forward or back animation
 */
function animateMove(move: Move, forward = true, animationLevel: 1 | 2 = 2) {
	const funcs = forward ? animatableChanges.forward : animatableChanges.backward;
	let clearanimations = true; // The first animation of a turn should clear prev turns animation
	// TODO: figure out a way to animate multiple moves of the same piece
	// Keyframing or smth

	let mainCoords = move.startCoords;

	// How does the rose animate?
	for (const change of move.changes) {
		if (!(change.action in funcs)) continue;
		if (animationLevel === 1 && change['piece'].type === move.type) {
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
 */
function updateGui({ showMoveCounter }: {
	/** Whether to show the move counter below the move buttons in the navigation bar. */
	showMoveCounter: boolean
}) {
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
};

export type {
	MoveDraft,
	Move
};