// src/shared/chess/util/moveutil.ts

/**
 * This script contains utility methods for working with the gamefile's moves list.
 */

import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { MoveFull } from '../logic/movepiece.js';
import type { MoveCoords } from '../logic/icn/icnconverter.js';
import type { Game, Board } from '../logic/gamefile.js';
import type { CoordsTagged } from '../logic/movepiece.js';

import coordutil from './coordutil.js';

// Functions ------------------------------------------------------------------------------

/**
 * Returns *true* if it is legal to forward the provided gamefile by 1 move, *false* if we're at the front of the game.
 */
function isIncrementingLegal(boardsim: Board): boolean {
	const incrementedIndex = boardsim.state.local.moveIndex + 1;
	return !isIndexOutOfRange(boardsim.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to rewind the provided gamefile by 1 move, *false* if we're at the beginning of the game.
 */
function isDecrementingLegal(boardsim: Board): boolean {
	const decrementedIndex = boardsim.state.local.moveIndex - 1;
	return !isIndexOutOfRange(boardsim.moves, decrementedIndex);
}

/**
 * Tests if the provided index is out of range of the moves list length
 */
function isIndexOutOfRange(moves: MoveCoords[], index: number): boolean {
	return index < -1 || index >= moves.length;
}

/**
 * Returns the very last move played in the moves list, if there is one. Otherwise, returns undefined.
 */
function getLastMove(moves: MoveFull[]): MoveFull | undefined {
	const finalIndex = moves.length - 1;
	if (finalIndex < 0) return;
	return moves[finalIndex];
}

/**
 * Returns the move we're currently viewing in the provided gamefile.
 */
function getCurrentMove(boardsim: Board): MoveFull | undefined {
	const index = boardsim.state.local.moveIndex;
	if (index < 0) return;
	return boardsim.moves[index];
}

/**
 * Gets the move from the moves list at the specified index
 */
function getMoveFromIndex(moves: MoveFull[], index: number): MoveFull {
	if (isIndexOutOfRange(moves, index)) throw Error('Cannot get next move when index overflow');
	return moves[index]!;
}

/**
 * Tests if the provided gamefile is viewing the front of the game, or the latest move.
 */
function areWeViewingLatestMove(boardsim: Board): boolean {
	const moveIndex = boardsim.state.local.moveIndex;
	const finalIndex = boardsim.moves.length - 1;
	return moveIndex === finalIndex;
}

/**
 * Returns total ply count (or half-moves) of the game so far.
 */
function getPlyCount(moves: MoveFull[]): number {
	return moves.length;
}

/**
 * Flags the gamefile's very last move as a "mate".
 */
function flagLastMoveAsMate(boardsim: Board): void {
	const lastMove = getLastMove(boardsim.moves);
	if (lastMove === undefined) return; // No moves, can't flag last move as mate (this can happen when pasting a game that's over)
	lastMove.flags.mate = true;
}

/**
 * Returns whether the game is resignable (at least 2 moves have been played).
 * If not, then the game is considered abortable.
 */
function isGameResignable(game: Game | Board): boolean {
	return game.moves.length > 1;
}

/**
 * Returns the color of the player that played the provided index within the moves list.
 */
function getColorThatPlayedMoveIndex(basegame: Game, index: number): Player {
	const turnOrder = basegame.gameRules.turnOrder;
	// If the starting position of the game is in check, then the player very last in the turnOrder is considered the one who *gave* the check.
	if (index === -1) return turnOrder[turnOrder.length - 1]!;
	return turnOrder[index % turnOrder.length]!;
}

/**
 * Returns the color whos turn it is after the specified move index was played.
 */
function getWhosTurnAtMoveIndex(basegame: Game, moveIndex: number): Player {
	return getColorThatPlayedMoveIndex(basegame, moveIndex + 1);
}

/**
 * Returns true if any player in the turn order ever gets to turn in a row.
 */
function doesAnyPlayerGet2TurnsInARow(basegame: Game): boolean {
	// If one player ever gets 2 turns in a row, then that also allows the capture of the king.
	const turnOrder = basegame.gameRules.turnOrder;
	for (let i = 0; i < turnOrder.length; i++) {
		const thisColor = turnOrder[i];
		const nextColorIndex = i === turnOrder.length - 1 ? 0 : i + 1; // If the color is last, then the next color is the first color of the turn order.
		const nextColor = turnOrder[nextColorIndex];
		if (thisColor === nextColor) return true;
	}
	return false;
}

/**
 * Strips the coordinates of any special move properties. NON-MUTATING, returns new coords.
 */
function stripSpecialMoveTagsFromCoords(coords: CoordsTagged): Coords {
	return coordutil.copyCoords(coords); // Does not copy non-enumerable properties
}

// ------------------------------------------------------------------------------

export default {
	isIncrementingLegal,
	isDecrementingLegal,
	getLastMove,
	getCurrentMove,
	getMoveFromIndex,
	areWeViewingLatestMove,
	getPlyCount,
	flagLastMoveAsMate,
	isGameResignable,
	getColorThatPlayedMoveIndex,
	getWhosTurnAtMoveIndex,
	doesAnyPlayerGet2TurnsInARow,
	stripSpecialMoveTagsFromCoords,
};
