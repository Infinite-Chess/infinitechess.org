
/**
 * This script contains utility methods for working with the gamefile's moves list.
 */


import type { Move, MoveDraft, castle, enpassant, promotion } from '../logic/movepiece.js';
import type { CoordsSpecial } from '../logic/movepiece.js';
import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { Game, Board } from '../logic/gamefile.js';
import type { GameRules } from '../variants/gamerules.js';
import type { _Move_Compact } from '../logic/icn/icnconverter.js';

import coordutil from './coordutil.js';
import { players } from './typeutil.js';


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
function getMoveOneForward(boardsim: Board): Move | undefined {
	const moveIndex = boardsim.state.local.moveIndex;
	const incrementedIndex = moveIndex + 1;
	return getMoveFromIndex(boardsim.moves, incrementedIndex);
}

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
function isIndexOutOfRange(moves: _Move_Compact[], index: number): boolean {
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
function getCurrentMove(boardsim: Board): Move | undefined {
	const index = boardsim.state.local.moveIndex;
	if (index < 0) return;
	return boardsim.moves[index];
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
function areWeViewingLatestMove(boardsim: Board): boolean {
	const moveIndex = boardsim.state.local.moveIndex;
	return isIndexTheLastMove(boardsim.moves, moveIndex);
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
 * Depends on the turn order. WILL NOT ACCOUNT FOR NULL MOVES.
 */
function getWhosTurnAtFront(basegame: Game): Player {
	return getWhosTurnAtMoveIndex(basegame, basegame.moves.length - 1);
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
	return turnOrder[numberOfMoves % turnOrder.length]!;
}

/**
 * Returns total ply count (or half-moves) of the game so far.
 */
function getPlyCount(moves: Move[]): number { return moves.length; }

/**
 * Tests if the piece on the provided coordinates at moved at least once in the gamefile.
 * @param boardsim
 * @param coords - The current coordinates of the piece.
 */
function hasPieceMoved(boardsim: Board, coords: Coords): boolean {
	return boardsim.moves.some((move: Move ) => coordutil.areCoordsEqual(move.endCoords, coords));
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
function flagLastMoveAsMate(boardsim: Board): void {
	const lastMove = getLastMove(boardsim.moves);
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
 * object to player black, otherwise player white.
 * @param moves - The gamefile's moves in the old 2D array format
 * @param results - PROVIDE AS AN EMPTY OBJECT! The 'turn' property will be set, destructively.
 * @returns Moves converted to the new 1D array format
 */
function convertMovesTo1DFormat(moves: DepricatedMoves): { moves: MoveDraft[], turn: Player } {
	let turn: Player = players.WHITE;
	const moves1D: MoveDraft[] = [];
	for (let a = 0; a < moves.length; a++) {
		const thisPair = moves[a]!;
		for (let b = 0; b < thisPair.length; b++) {
			const thisMove = thisPair[b]!;
			if (thisMove === null) turn = players.BLACK;
			else moves1D.push(thisMove as MoveDraft);
		}
	}
	return { moves: moves1D, turn };
}

/**
 * Returns whether the game is resignable (at least 2 moves have been played).
 * If not, then the game is considered abortable.
 */
function isGameResignable(game: Game | Board): boolean { return game.moves.length > 1; }

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
function stripSpecialMoveTagsFromCoords(coords: CoordsSpecial): Coords {
	return coordutil.copyCoords(coords); // Does not copy non-enumerable properties
}

/**
 * Tests if the move is a null move.
 * Only engines should be able to create and make null moves, for null move pruning.
 * Players should not be able to submit self moves in any possible way.
 */
function isMoveNullMove(move: _Move_Compact): boolean {
	return coordutil.areCoordsEqual(move.startCoords, move.endCoords);
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
	isMoveNullMove,
};