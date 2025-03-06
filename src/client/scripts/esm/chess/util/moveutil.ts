
/**
 * This script contains utility methods for working with the gamefile's moves list.
 */


import type { Move, MoveDraft, castle, enpassant, promotion } from '../logic/movepiece.js';
import type { CoordsSpecial } from '../logic/movepiece.js';
import type { Coords } from './coordutil.js';
// @ts-ignore
import type { gamefile } from '../logic/gamefile.js';
// @ts-ignore
import type { GameRules } from '../variants/gamerules.js';
import type { Player } from './typeutil.js';

import coordutil from './coordutil.js';


// Type Definitions ------------------------------------------------------------------------------


/**
 * The format of outdated 2D moves list in game ICN notation. 
 * 
 * Where if the first move in the first array is null, that means it's black to move first.
 * No other move will be null.
 */
type DepricatedMoves = [null | DepricatedMove, null | DepricatedMove][]

/** The format of an outdated Move */
interface DepricatedMove {
	startCoords: Coords,
	endCoords: Coords,
	type: string,
	captured?: string,
	enpassant?: enpassant,
	promotion?: promotion,
	castle?: castle
}


// Functions ------------------------------------------------------------------------------


/**
 * Returns the move one forward from the current position we're viewing, if it exists.
 * This is also the move we would execute if we forward the game 1 step.
 */
function getMoveOneForward(gamefile: gamefile): Move | undefined {
	const moveIndex = gamefile.moveIndex;
	const incrementedIndex = moveIndex + 1;
	return getMoveFromIndex(gamefile.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to forward the provided gamefile by 1 move, *false* if we're at the front of the game.
 */
function isIncrementingLegal(gamefile: gamefile): boolean {
	const incrementedIndex = gamefile.moveIndex + 1;
	return !isIndexOutOfRange(gamefile.moves, incrementedIndex);
}

/**
 * Returns *true* if it is legal to rewind the provided gamefile by 1 move, *false* if we're at the beginning of the game.
 */
function isDecrementingLegal(gamefile: gamefile): boolean {
	const decrementedIndex = gamefile.moveIndex - 1;
	return !isIndexOutOfRange(gamefile.moves, decrementedIndex);
}

/**
 * Tests if the provided index is out of range of the moves list length
 */
function isIndexOutOfRange(moves: Move[], index: number): boolean {
	return index < -1 || index >= moves.length;
}

/**
 * Returns the very last move played in the moves list, if there is one. Otherwise, returns undefined.
 */
function getLastMove(moves: Move[]): Move | undefined {
	const finalIndex = moves.length - 1;
	if (finalIndex < 0) return;
	return moves[finalIndex];
}

/**
 * Returns the move we're currently viewing in the provided gamefile.
 */
function getCurrentMove(gamefile: gamefile): Move | undefined {
	const index = gamefile.moveIndex;
	if (index < 0) return;
	return gamefile.moves[index];
}

/**
 * Gets the move from the moves list at the specified index
 */
function getMoveFromIndex(moves: Move[], index: number): Move {
	if (isIndexOutOfRange(moves, index)) throw Error("Cannot get next move when index overflow");
	return moves[index]!;
}

/**
 * Tests if the provided gamefile is viewing the front of the game, or the latest move.
 */
function areWeViewingLatestMove(gamefile: gamefile): boolean {
	const moveIndex = gamefile.moveIndex;
	return isIndexTheLastMove(gamefile.moves, moveIndex);
}

/**
 * Tests if the provided index is the index of the last move in the provided list
 */
function isIndexTheLastMove(moves: Move[], index: number): boolean {
	const finalIndex = moves.length - 1;
	return index === finalIndex;
}

/**
 * Gets the color of whos turn it is currently, or at the front of the game.
 * Depends on the turn order.
 */
function getWhosTurnAtFront(gamefile: gamefile): Player {
	return getWhosTurnAtMoveIndex(gamefile, gamefile.moves.length - 1);
}

/**
 * Returns whos turn it is at the front of the game,
 * provided the only information you have is the existing moves list
 * and the turnOrder gamerule.
 * 
 * You may need this if the gamefile hasn't actually been contructed yet.
 * @param numberOfMoves - The number of moves played in the game so far (length of the current moves list).
 * @param turnOrder - The order of players turns in the game.
 */
function getWhosTurnAtFrom_ByMoveCountAndTurnOrder(numberOfMoves: number, turnOrder: GameRules['turnOrder']): Player {
	return turnOrder[numberOfMoves % turnOrder.length];
}

/**
 * Returns total ply count (or half-moves) of the game so far.
 */
function getPlyCount(moves: Move[]): number { return moves.length; }

/**
 * Tests if the piece on the provided coordinates at moved atleast once in the gamefile.
 * @param gamefile
 * @param coords - The current coordinates of the piece.
 */
function hasPieceMoved(gamefile: gamefile, coords: Coords): boolean {
	return gamefile.moves.some((move: Move) => coordutil.areCoordsEqual(move.endCoords, coords));
}

// COMMENTED-OUT because it's not used anywhere in the code
// /**
//  * Flags the gamefile's very last move as a "check".
//  * @param {gamefile} gamefile - The gamefile
//  */
// function flagLastMoveAsCheck(gamefile) {
// 	if (gamefile.moves.length === 0) throw new Error("Cannot flag the game's last move as a 'check' when there are no moves.");
// 	const lastMove = getLastMove(gamefile.moves);
// 	lastMove.check = true;
// }

/**
 * Flags the gamefile's very last move as a "mate".
 */
function flagLastMoveAsMate(gamefile: gamefile) {
	const lastMove = getLastMove(gamefile.moves);
	if (lastMove === undefined) return; // No moves, can't flag last move as mate (this can happen when pasting a game that's over)
	lastMove.flags.mate = true;
}

/**
 * Returns true if the moves are in the old 2D array format.
 */
function areMovesIn2DFormat(longmoves: Move[] | DepricatedMoves): boolean {
	if (longmoves.length === 0) return false; // Empty, assume they are in the new 1D format
	return Array.isArray(longmoves[0]);
}

/**
 * Converts a gamefile's move list from the old 2D array format to the new 1D format.
 * If it's a black-moves-first game, it sets the 'turn' property of the provided results
 * object to 'black', otherwise 'white'.
 * @param moves - The gamefile's moves in the old 2D array format
 * @param results - PROVIDE AS AN EMPTY OBJECT! The 'turn' property will be set, destructively.
 * @returns Moves converted to the new 1D array format
 */
function convertMovesTo1DFormat(moves: DepricatedMoves): { moves: MoveDraft[], turn: string } {
	let turn = 'white';
	const moves1D: MoveDraft[] = [];
	for (let a = 0; a < moves.length; a++) {
		const thisPair = moves[a]!;
		for (let b = 0; b < thisPair.length; b++) {
			const thisMove = thisPair[b]!;
			if (thisMove === null) turn = 'black';
			else moves1D.push(thisMove as MoveDraft);
		}
	}
	return { moves: moves1D, turn };
}

/**
 * Returns whether the game is resignable (atleast 2 moves have been played).
 * If not, then the game is considered abortable.
 */
function isGameResignable(gamefile: gamefile): boolean { return gamefile.moves.length > 1; }

/**
 * Returns the color of the player that played the provided index within the moves list.
 */
function getColorThatPlayedMoveIndex(gamefile: gamefile, index: number): Player {
	if (index === -1) throw Error("Cannot get color that played move index when move index is -1.");
	const turnOrder = gamefile.gameRules.turnOrder;
	return turnOrder[index % turnOrder.length];
}

/**
 * Returns the color whos turn it is after the specified move index was played.
 */
function getWhosTurnAtMoveIndex(gamefile: gamefile, moveIndex: number): Player {
	return getColorThatPlayedMoveIndex(gamefile, moveIndex + 1);
}

/**
 * Returns true if any player in the turn order ever gets to turn in a row.
 */
function doesAnyPlayerGet2TurnsInARow(gamefile: gamefile): boolean {
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
 * Strips the coordinates of any special move properties.
 */
function stripSpecialMoveTagsFromCoords(coords: CoordsSpecial): Coords {
	return coordutil.copyCoords(coords); // Does not copy non-enumerable properties
}


// ------------------------------------------------------------------------------


export default {
	getMoveOneForward,
	isIncrementingLegal,
	isDecrementingLegal,
	isIndexOutOfRange,
	getLastMove,
	getCurrentMove,
	getMoveFromIndex,
	areWeViewingLatestMove,
	isIndexTheLastMove,
	getWhosTurnAtFront,
	getWhosTurnAtFrom_ByMoveCountAndTurnOrder,
	getPlyCount,
	hasPieceMoved,
	// flagLastMoveAsCheck,
	flagLastMoveAsMate,
	areMovesIn2DFormat,
	convertMovesTo1DFormat,
	isGameResignable,
	getColorThatPlayedMoveIndex,
	getWhosTurnAtMoveIndex,
	doesAnyPlayerGet2TurnsInARow,
	stripSpecialMoveTagsFromCoords,
};