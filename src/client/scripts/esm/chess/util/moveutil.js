
/**
 * This script contains methods for working with the gamefile's moves list.
 */


import coordutil from './coordutil.js';


/** 
 * Type Definitions 
 * @typedef {import('../logic/gamefile.js').gamefile} gamefile
 * @typedef {import('../logic/boardchanges.js').Change} Change
 * @typedef {import('../../game/chess/movesequence.js').Move} Move
*/


"use strict";


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
	const incrementedIndex = gamefile.moveIndex + 1;
	return !isIndexOutOfRange(gamefile.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to rewind the provided gamefile by 1 move, *false* if we're at the beginning of the game.
 * @param {gamefile} gamefile - The gamefile
 * @returns {boolean}
 */
function isDecrementingLegal(gamefile) {
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

/**
 * Strips the coordinates of their special move properties.
 * For example, unstripped coords may look like: `[2,7,enpassant:true]`
 * @param {number[]} coords - The coordinates
 * @returns {number[]} The stripped coordinates: `[2,7]`
 */
function stripSpecialMoveTagsFromCoords(coords) { return [coords[0], coords[1]]; }


export default {
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
	stripSpecialMoveTagsFromCoords,
};