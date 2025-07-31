/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 */

import type { FullGame } from '../../chess/logic/gamefile.js';
import type { Mesh } from '../rendering/piecemodels.js';


import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import movesequence from './movesequence.js';
import boardutil from '../../chess/util/boardutil.js';
import typeutil from '../../chess/util/typeutil.js';
import legalmoves from '../../chess/logic/legalmoves.js';
import enginegame from '../misc/enginegame.js';
import coordutil from '../../chess/util/coordutil.js';
import boardpos from '../rendering/boardpos.js';
import preferences from '../../components/header/preferences.js';
import selection from './selection.js';
import specialrighthighlights from '../rendering/highlights/specialrighthighlights.js';
import squarerendering from '../rendering/highlights/squarerendering.js';
import movepiece, { Edit, MoveDraft } from '../../chess/logic/movepiece.js';
import { animateMove } from './graphicalchanges.js';
import gameslot from './gameslot.js';


// Type Definitions ---------------------------------------------



interface Premove extends Edit, MoveDraft {
	/** The type of piece moved */
	type: number,
}


// Variables ----------------------------------------------------


/** The list of all premoves we currently have, in order. */
let premoves: Premove[] = [];

/**
 * Whether the premoves board and state changes have been applied to the board.
 * This is purely for DEBUGGING so you don't accidentally call these
 * methods at the wrong times.
 * 
 * When premove's changes have to be reapplied, we have to recalculate all
 * of their changes, since for all we know they could end up capturing a
 * piece when they didn't when we originally premoved, or vice versa.
 * 
 * THIS SHOULD ONLY TEMPORARILY ever be false!! If it is, it means we just
 * need to do something like calculating legal moves, then reapply the premoves.
 */
let applied: boolean = true;


// Processing Premoves ---------------------------------------------------------------------


/** Gets all pending premoves. */
function getPremoves() {
	return premoves;
}

/** Adds an premove and applies its changes to the board. */
function addPremove(gamefile: FullGame, mesh: Mesh | undefined, moveDraft: MoveDraft): Premove {
	// console.log("Adding premove");

	if (!applied) throw Error("Don't addPremove when other premoves are not applied!");

	const premove = generatePremove(gamefile, moveDraft);

	applyPremove(gamefile, mesh, premove, true); // Apply the premove to the game state

	premoves.push(premove);
	// console.log(premoves);

	return premove;
}

/** Applies a premove's changes to the board. */
function applyPremove(gamefile: FullGame, mesh: Mesh | undefined, premove: Premove, forward: boolean) {
	// console.log(`Applying premove ${forward ? 'FORWARD' : 'BACKWARD'}:`, premove);
	movepiece.applyEdit(gamefile, premove, forward, true); // forward & global are true
	if (mesh) movesequence.runMeshChanges(gamefile.boardsim, mesh, premove, forward);
}

/** Similar to {@link movepiece.generateMove}, but generates the edit for a Premove. */
function generatePremove(gamefile: FullGame, moveDraft: MoveDraft): Premove {
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.startCoords);
	if (!piece) throw Error(`Cannot generate premove because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`);

	// Initialize the state, and change list, as empty for now.
	const premove: Premove = {
		...moveDraft,
		type: piece.type,
		changes: [],
		state: { local: [], global: [] },
	};

	const rawType = typeutil.getRawType(piece.type);
	// This means a pawn double push won't create a state change of adding the enpassant square to the gamefile!
	// We should not do that for premoves.
	const skip_state_changes = true;
	let specialMoveMade: boolean = false;
	// If a special move function exists for this piece type, run it.
	// The actual function will return whether a special move was actually made or not.
	// If a special move IS made, we skip the normal move piece method.

	if (rawType in gamefile.boardsim.specialMoves) specialMoveMade = gamefile.boardsim.specialMoves[rawType]!(gamefile.boardsim, piece, premove, skip_state_changes);
	if (!specialMoveMade) movepiece.calcMovesChanges(gamefile.boardsim, piece, moveDraft, premove); // Move piece regularly (no special tag)
	
	// Delete all special rights that should be revoked from the move.
	movepiece.queueSpecialRightDeletionStateChanges(gamefile.boardsim, premove);

	return premove;
}

/** Clears all pending premoves */
function clearPremoves() {
	// console.error("Clearing premoves");
	premoves = [];
	// Since we now have zero premoves, they are technically applied.
	// console.error("Setting applied to true.");
	applied = true;
}

/** Cancels all premoves */
function cancelPremoves(gamefile: FullGame, mesh?: Mesh) {
	// console.log("Clearing premoves");
	rewindPremoves(gamefile, mesh);
	clearPremoves();
}

/** Unapplies all pending premoves by undoing their changes on the board. */
function rewindPremoves(gamefile: FullGame, mesh?: Mesh) {
	if (!applied) throw Error("Don't rewindPremoves when other premoves are not applied!");

	// Reverse the original array so all changes are made in the reverse order they were added
	premoves.slice().reverse().forEach(premove => {
		applyPremove(gamefile, mesh, premove, false); // Apply the premove to the game state backwards
	});

	// console.error("Setting applied to false.");
	applied = false;

	specialrighthighlights.onMove();
}

/**
 * Reapplies all pending premoves' changes onto the board.
 * 
 * All premove's must be regenerated, as for all we know
 * their destination square could have a new piece, or lack thereof.
 */
function applyPremoves(gamefile: FullGame, mesh?: Mesh) {
	if (applied) throw Error("Don't applyPremoves when other premoves are already applied!");

	for (let i = 0; i < premoves.length; i++) {
		const oldPremove = premoves[i]!;

		// MUST RECALCULATE CHANGES
		const premoveDraft: MoveDraft = pullMoveDraftFromPremove(oldPremove);
		const premove = generatePremove(gamefile, premoveDraft);

		premoves[i] = premove; // Update the premove with the new changes
		applyPremove(gamefile, mesh, premove, true); // Apply the premove to the game state
	}

	// console.error("Setting applied to true.");
	applied = true;
}

/**
 * Processes the premoves array after the opponent's move.
 * Attempts to play the first premove in the list.
 * A. Legal => Plays it, submits it, then applies the remaining premoves.
 * B. Illegal => Clears all premoves.
 */
function processPremoves(gamefile: FullGame, mesh?: Mesh): void {
	// console.error("Processing premoves");

	if (applied) throw Error("Don't processPremoves when other premoves are still applied! rewindPremoves() first.");

	const premove: Premove | undefined = premoves[0];
	// CAN'T EARLY EXIT if there are no premoves, as
	// we still need clearPremoves() to set applied to true!

	// Check if the move is legal
	const isLegal = premove && premoveIsLegal(gamefile, premove);
	if (isLegal) {
		// console.log("Premove is legal, applying it");

		// Legal, apply the premove to the real game state
		const premoveDraft: MoveDraft = pullMoveDraftFromPremove(premove);
		const move = movesequence.makeMove(gamefile, mesh, premoveDraft); // Make move

		movesendreceive.sendMove();
		enginegame.onMovePlayed();

		premoves.shift(); // Remove premove

		// Only instant animate
		// This also immediately terminates the opponent's move animation
		// MUST READ the move's changes returned from movesequence.makeMove()
		// instead of the premove's changes, as the changes need to be regenerated!
		animateMove(move.changes, true, false);

		// Apply remaining premove changes & visuals, but don't make them physically on the board
		applyPremoves(gamefile, mesh);
	} else {
		// console.log("Premove is illegal, clearing all premoves");
		// Illegal, clear all premoves (they have already been rewounded before processPremoves() was called)
		clearPremoves();
	}
}


/** Tests whether a given premove is legal to make on the board. */
function premoveIsLegal(gamefile: FullGame, premove: Premove): boolean {
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, premove.startCoords);
	if (!piece) return false; // Can't premove nothing, could happen if your piece was captured by enpassant

	if (premove.type !== piece.type) return false; // Our piece was probably captured, so it can't move anymore, thus the premove is illegal.

	if (selection.getEditMode()) return true;

	// Check if the move is legal
	const premovedPieceLegalMoves = legalmoves.calculateAll(gamefile, piece);
	const color = typeutil.getColorFromType(piece.type);
	return legalmoves.checkIfMoveLegal(gamefile, premovedPieceLegalMoves, piece.coords, premove.endCoords, color);
}

/** Extracts the original MoveDraft from a generated Premove. */
function pullMoveDraftFromPremove(premove: Premove): MoveDraft {
	return {
		startCoords: premove.startCoords,
		endCoords: premove.endCoords,
		promotion: premove.promotion,
		// Don't miss any other special move flags
		enpassantCreate: premove.enpassantCreate,
		enpassant: premove.enpassant,
		castle: premove.castle,
		path: premove.path,
	};
}

/**
 * Called externally when its our move in the game.
 * 
 * Shouldn't care whether the game is over, as all premoves should have been cleared,
 * and not to mention we still need applied to be set to true.
 */
function onYourMove(gamefile: FullGame, mesh?: Mesh) {
	// Process the next premove, will reapply the premoves
	processPremoves(gamefile, mesh);
}

/**
 * Call externally when the game is concluded after it ends.
 * Erases pending premoves, leaving the `applied` state at what it was before
 * so the rest of the code doesn't experience it changed randomly.
 */
function onGameConclude() {
	// console.error("Game ended, clearing premoves");

	const originalApplied = applied; // Save the original applied state

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh();

	if (applied) rewindPremoves(gamefile, mesh);
	clearPremoves();

	// Restore the original applied state, as the rest of the code will have expected it not to change.
	applied = originalApplied;
}


// Rendering --------------------------------------------------------


/** Renders the premoves */
function render() {
	if (premoves.length === 0) return; // No premoves to render

	let premoveSquares = premoves.flatMap(p => [p.startCoords, p.endCoords]);

	// De-duplicate the squares
	premoveSquares = premoveSquares.filter((coords, index, self) => {
		return self.findIndex(c => coordutil.areCoordsEqual(c, coords)) === index;
	});

	const size = boardpos.getBoardScale();
	const color = preferences.getAnnoteSquareColor();

	// Render preset squares
	squarerendering.genModel(premoveSquares, color).render(undefined, undefined, { size });
}


// Exports ------------------------------------------------


export default {
	getPremoves,
	addPremove,
	cancelPremoves,
	rewindPremoves,
	applyPremoves,
	onYourMove,
	onGameConclude,
	render,
};