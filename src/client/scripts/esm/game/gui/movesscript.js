
// This contains methods for working with the gamefile's moves list,
// and detects if we're rewinding or fast-forwarding to view the game's history.

// Import Start
import coordutil from '../../chess/util/coordutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
*/


"use strict";

// Custom type definitions...

/** The `Move` custom type. This should not be called, it is for JSDoc dropdown info. */
function Move() {
	console.error('This Move constructor should NEVER be called! It is purely for useful JSDoc dropdown info when working with the `Move` type.');

	/** The type of piece moved (e.g. `queensW`). */
	this.type = undefined;
	/** The start coordinates of the piece: `[x,y]` */
	this.startCoords = undefined;
	/** The end coordinates of the piece: `[x,y]`  */
	this.endCoords = undefined;
	/** The type of piece captured (e.g. `knightsB`), if one was made. @type {string} */
	this.captured = undefined;
	/** Whether the move delivered check. */
	this.check = undefined;
	/** Whether the move delivered mate (or the killing move). */
	this.mate = undefined;
	/** Present if the move was special-move enpassant capture. This will be
	 * 1 for the captured piece is 1 square above, or -1 for 1 square below. */
	this.enpassant = undefined;
	/** Present if the move was a special-move promotion. This will be
	 * a string of the type of piece being promoted to: "queensW" */
	this.promotion = undefined;
	/** Present if the move was a special-move casle. This may look like an
	 * object: `{ coord, dir }` where `coord` is the starting coordinates of the
	 * rook being castled with, and `dir` is the direction castled, 1 for right and -1 for left. */
	this.castle = undefined;
	/** Contains information for undoing simulated moves.
     * Several of these properties are impossible to recalculate without
     * looking at previous moves, or replaying the whole game. */
	this.rewindInfo = {
		/** The index of the captured piece within the gamefile's piece list.
         * Required to not screw up the mesh when simulating. */
		capturedIndex: undefined,
		/** The index of the promoted pawn within the gamefile's piece list.
         * Required to not screw up the mesh when simulating. */
		pawnIndex: undefined,
		/** Whether the moved piece had its special right before moving. */
		specialRightStart: undefined,
		/** Whether the piece on the destination had its special rights before being captured. */
		specialRightEnd: undefined,
		/** The gamefile's `enpassant` property before this move was made. */
		enpassant: undefined,
		/** The gamefile's `moveRuleState` property before this move was made. */
		moveRuleState: undefined,
		/** The gamefile's `checksGiven` property before this move was made. */
		checksGiven: undefined,
		/** The gamefile's `inCheck` property before this move was made. */
		inCheck: undefined,
		/** The gamefile's `attackers` property before this move was made. */
		attackers: undefined,
		/** The gamefile's `gameConclusion` property before this move was made. */
		gameConclusion: undefined,
	};
	/** The move in most compact notation: `8,7>8,8Q` */
	this.compact = undefined;
}

/**
 * This script contains methods for working with the gamefile's moves list.
 */

/**
 * Returns the move one forward from the current position we're viewing, if it exists.
 * This is also the move we would execute if we forward the game 1 step.
 * @param {gamefile} gamefile - The gamefile
 * @returns {Move | undefined} The move
 */
function getMoveOneForward(gamefile) {
	const moveIndex = gamefile.moveIndex;
	const incrementedIndex = moveIndex + 1;
	return getMoveFromIndex(gamefile.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to forward the provided gamefile by 1 move, *false* if we're at the front of the game.
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean}
 */
function isIncrementingLegal(gamefile) {
	if (gamefile == null) throw new Error("Cannot ask if incrementing moves is legal when there's no gamefile.");

	const incrementedIndex = gamefile.moveIndex + 1;
	return !isIndexOutOfRange(gamefile.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to rewind the provided gamefile by 1 move, *false* if we're at the beginning of the game.
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean}
 */
function isDecrementingLegal(gamefile) {
	if (gamefile == null) throw new Error("Cannot ask if decrementing moves is legal when there's no gamefile.");

	const decrementedIndex = gamefile.moveIndex - 1;
	return !isIndexOutOfRange(gamefile.moves, decrementedIndex);
}

/**
 * Tests if the provided index is out of range of the moves list length
 * @param {Move[]} moves - The moves list
 * @param {number} index - The index
 * @returns {boolean} *true* if the index is out of range
 */
function isIndexOutOfRange(moves, index) { return index < -1 || index >= moves.length; }

/**
 * Returns the very last move played in the moves list, if there is one. Otherwise, returns undefined.
 * @param {Move[]} moves - The moves list
 * @returns {Move | undefined} The last move, undefined if there isn't one.
 */
function getLastMove(moves) {
	const finalIndex = moves.length - 1;
	if (finalIndex < 0) return;
	return moves[finalIndex];
}

// 

/**
 * Returns the move we're currently viewing in the provided gamefile.
 * @param {gamefile} gamefile - The gamefile
 * @returns {Move} The move
 */
function getCurrentMove(gamefile) {
	const index = gamefile.moveIndex;
	if (index < 0) return;
	return gamefile.moves[index];
}

/**
 * Gets the move from the moves list at the specified index
 * @param {Move[]} moves - The moves
 * @param {number} index - The index
 * @returns {Move} The move at the specified index
 */
function getMoveFromIndex(moves, index) { // [index1, plyIndex]
	if (isIndexOutOfRange(moves, index)) return console.error("Cannot get next move when index overflow");
	return moves[index];
}

/**
 * Tests if the provided gamefile is viewing the front of the game.
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean} *true* if the provided gamefile is viewing the final move
 */
function areWeViewingLatestMove(gamefile) {
	const moveIndex = gamefile.moveIndex;
	return isIndexTheLastMove(gamefile.moves, moveIndex);
}

/**
 * Tests if the provided index is the index of the last move in the provided list
 * @param {Move[]} moves - The moves list
 * @param {number} index - The index
 * @returns {boolean} *true* if the provided index is that index of the last move in the list
 */
function isIndexTheLastMove(moves, index) {
	const finalIndex = moves.length - 1;
	return index === finalIndex;
}

/**
 * Gets whos turn it is currently, or at the front of the game.
 * Sensitive to whether it's a black-moves-first game or not.
 * @param {gamefile} gamefile - The gamefile
 * @returns {string} Whos turn it is, 'white' or 'black'
 */
function getWhosTurnAtFront(gamefile) {
	return getWhosTurnAtMoveIndex(gamefile, gamefile.moves.length - 1);
}

/**
 * Returns total ply count (or half-moves) of the game so far.
 * @param {Move[]} moves - The moves list
 * @returns {number} The ply count
 */
function getPlyCount(moves) { return moves.length; }

/**
 * Tests if the piece on the provided coordinates at moved atleast once in the gamefile.
 * This info is also kept track of in the gamefile's `specialRights` property.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - Coordinates of the piece
 * @returns {boolean} *true* if the piece has moved
 */
function hasPieceMoved(gamefile, coords) {
	for (const thisMove of gamefile.moves) {
		if (coordutil.areCoordsEqual(thisMove.endCoords, coords)) return true;
	}
	return false;
}

/**
 * Deletes the latest move played.
 * @param {Move[]} moves - The moves list
 */
function deleteLastMove(moves) {
	if (moves.length === 0) return console.error("Cannot delete last move when there are none");
	moves.pop();
}

/**
 * Returns true if the moves are in the old 2D array format.
 * @param {Move[]} longmoves - The gamefile's moves parameter
 * @returns {boolean} *true* if the moves are in the old 2D format, false if in new 1D format.
 */
function areMovesIn2DFormat(longmoves) {
	if (longmoves.length === 0) return false; // Empty, assume they are in the new 1D format
	return Array.isArray(longmoves[0]);
}

/**
 * Converts a gamefile's move list from the old 2D array format to the new 1D format.
 * If it's a black-moves-first game, it sets the 'turn' property of the provided results
 * object to 'black', otherwise 'white'.
 * @param {Object[][]} moves - The gamefile's moves in the old 2D array format
 * @param {Object} results - An empty object where the 'turn' property will be set
 * @returns {Move[]} Moves converted to the new 1D array format
 */
function convertMovesTo1DFormat(moves, results) {
	results.turn = 'white';
	const moves1D = [];
	for (let a = 0; a < moves.length; a++) {
		const thisPair = moves[a];
		for (let b = 0; b < thisPair.length; b++) {
			const thisMove = thisPair[b];
			if (thisMove === null) results.turn = 'black';
			else moves1D.push(thisMove);
		}
	}
	return moves1D;
}

/**
 * Flags the gamefile's very last move as a "check".
 * @param {gamefile} gamefile - The gamefile
 */
function flagLastMoveAsCheck(gamefile) {
	if (gamefile.moves.length === 0) throw new Error("Cannot flag the game's last move as a 'check' when there are no moves.");
	const lastMove = getLastMove(gamefile.moves);
	lastMove.check = true;
}

/**
 * Flags the gamefile's very last move as a "mate".
 * @param {gamefile} gamefile - The gamefile
 */
function flagLastMoveAsMate(gamefile) {
	if (gamefile.moves.length === 0) return; // No moves, can't flag last move as mate (this can happen when pasting a game that's over)
	const lastMove = getLastMove(gamefile.moves);
	lastMove.mate = true;
}

/**
 * Tests if the game is resignable (atleast 2 moves have been played).
 * If not, then the game is abortable.
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean} *true* if the game is resignable.
 */
function isGameResignable(gamefile) { return gamefile.moves.length > 1; }

/**
 * Returns the color of the player that played that moveIndex within the moves list.
 * Returns error if index is -1
 * @param {gamefile} gamefile 
 * @param {number} i - The moveIndex
 * @returns {string} - The color that playd the moveIndex
 */
function getColorThatPlayedMoveIndex(gamefile, i) {
	if (i === -1) return console.error("Cannot get color that played move index when move index is -1.");
	const turnOrder = gamefile.gameRules.turnOrder;
	const loopIndex = i % turnOrder.length;
	return turnOrder[loopIndex];
}

/**
 * Returns the color whos turn it is after the specified move index was played.
 * @param {gamefile} gamefile - The gamefile
 * @param {number} moveIndex - The move index we want to get whos turn it was then.
 * @returns {string} 'white' / 'black'
 */
function getWhosTurnAtMoveIndex(gamefile, moveIndex) {
	return getColorThatPlayedMoveIndex(gamefile, moveIndex + 1);
}

/**
 * Returns true if any player in the turn order ever gets to turn in a row.
 * @param {gamefile} gamefile
 * @returns {boolean}
 */
function doesAnyPlayerGet2TurnsInARow(gamefile) {
	// If one player ever gets 2 turns in a row, then that also allows the capture of the king.
	const turnOrder = gamefile.gameRules.turnOrder;
	for (let i = 0; i < turnOrder.length; i++) {
		const thisColor = turnOrder[i];
		const nextColorIndex = i === turnOrder.length - 1 ? 0 : i + 1; // If the color is last, then the next color is the first color of the turn order.
		const nextColor = turnOrder[nextColorIndex];
		if (thisColor === nextColor) return true;
	}
	return false;
}

// Type export DO NOT USE
export { Move };

export default {
	rewindMove,
	forwardMove,
	isIncrementingLegal,
	isDecrementingLegal,
	isIndexOutOfRange,
	getLastMove,
	getCurrentMove,
	getMoveFromIndex,
	areWeViewingLatestMove,
	isIndexTheLastMove,
	getWhosTurnAtFront,
	getPlyCount,
	hasPieceMoved,
	deleteLastMove,
	flagLastMoveAsCheck,
	flagLastMoveAsMate,
	areMovesIn2DFormat,
	convertMovesTo1DFormat,
	isGameResignable,
	getColorThatPlayedMoveIndex,
	getWhosTurnAtMoveIndex,
	doesAnyPlayerGet2TurnsInARow,
	getMoveOneForward,
};