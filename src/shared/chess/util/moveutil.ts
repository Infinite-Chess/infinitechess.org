// src/shared/chess/util/moveutil.ts

/**
 * This script contains utility methods for working with the gamefile's moves list.
 */

import type { Board } from '../logic/boardinit.js';
import type { Coords } from './coordutil.js';
import type { Player } from './typeutil.js';
import type { GameRules } from './gamerules.js';
import type { EnPassant } from '../logic/state.js';
import type { MoveCoords } from '../logic/icn/icnconverter.js';
import type { MoveFull, CoordsTagged, MoveRecord } from '../logic/movepiece.js';

import coordutil from './coordutil.js';

// Types ------------------------------------------------------------------

/** A special move tag on {@link CoordsTagged}, both move tags and UI tags. */
export interface SpecialTags extends MoveSpecialTags, UISpecialTags {}

/**
 * A special move tag that is retained when transferring from {@link CoordsTagged} to a move.
 * This describes what actually happened during the move execution.
 */
export interface MoveSpecialTags {
	/** Special move tag that, when present, making the move will create an enpassant state on the gamefile. */
	enpassantCreate: EnPassant;
	/**
	 * A special move tag for enpassant capture.
	 *
	 * If true, the specialMove function for pawns will read the gamefile's
	 * enpassant property to figure out where the pawn to capture is.
	 * After that, the captured piece is appended to the move's changes list,
	 * so we don't actually need to store more information in here.
	 */
	enpassant: true;
	/** A special move tag for pawn promotion. This is the integer type of the piece promoted to. */
	promotion: number;
	/** A special move tag for castling. */
	castle: {
		/** 1 => King castled right   -1 => King castled left */
		dir: 1n | -1n;
		/** The coordinate of the piece the king castled with, usually a rook. */
		coord: Coords;
	};
	/**
	 * A special move tag that stores a list of all the waypoints along
	 * the travel path of a piece. Inclusive to start and end.
	 *
	 * Used for Rose piece.
	 */
	path: Coords[];
}

/**
 * A special move tag that is UI-only. It is present on {@link CoordsTagged}
 * to signal something to the UI (e.g. open the promotion picker), and is
 * consumed and removed BEFORE the move is executed — never transferred to a move.
 */
interface UISpecialTags {
	/**
	 * A special move tag that, when the move is attempted to be made should
	 * trigger the promotion UI to open. The special detect functions are in
	 * charge of adding this. selection.ts will delete it and open the promotion UI.
	 */
	promoteTrigger: boolean;
}

// Constants ------------------------------------------------------------------------------

/**
 * All special move tag names that are retained when transferring from {@link CoordsTagged}
 * to a move. These describe what actually happened during the move execution.
 */
const MOVE_SPECIAL_TAGS = [
	'enpassantCreate',
	'enpassant',
	'promotion',
	'castle',
	'path',
] satisfies ReadonlyArray<keyof MoveSpecialTags>;

/**
 * All special move tag names that are UI-only. They are present on {@link CoordsTagged}
 * to signal something to the UI (e.g. open the promotion picker), and are
 * consumed and removed BEFORE the move is executed — never transferred to a move.
 */
const UI_SPECIAL_TAGS = ['promoteTrigger'] satisfies ReadonlyArray<keyof UISpecialTags>;

/** All special move tags names on {@link CoordsTagged}, both move tags and UI tags. */
const SPECIAL_TAGS = [...MOVE_SPECIAL_TAGS, ...UI_SPECIAL_TAGS] satisfies ReadonlyArray<
	keyof SpecialTags
>;

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
 * @param game - The minimum properties needed from the gamefile to check if the game is resignable. MUST PASS IN ACTUAL GAMEFILE, NOT A FAKE.
 */
function isGameResignable(game: { moves: MoveRecord[] }): boolean {
	return game.moves.length > 1;
}

/**
 * Returns the color of the player that played the provided index within the moves list.
 * @param game - The gamefile with the gameRules
 */
function getColorThatPlayedMoveIndex(game: { gameRules: GameRules }, index: number): Player {
	const turnOrder = game.gameRules.turnOrder;
	// If the starting position of the game is in check, then the player very last in the turnOrder is considered the one who *gave* the check.
	if (index === -1) return turnOrder[turnOrder.length - 1]!;
	return turnOrder[index % turnOrder.length]!;
}

/**
 * Returns the color whos turn it is after the specified move index was played.
 * @param game - The gamefile with the gameRules
 */
function getWhosTurnAtMoveIndex(game: { gameRules: GameRules }, moveIndex: number): Player {
	return getColorThatPlayedMoveIndex(game, moveIndex + 1);
}

/**
 * Returns true if any player in the turn order ever gets to turn in a row.
 */
function doesAnyPlayerGet2TurnsInARow(gameRules: GameRules): boolean {
	// If one player ever gets 2 turns in a row, then that also allows the capture of the king.
	const turnOrder = gameRules.turnOrder;
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
	// Constants
	MOVE_SPECIAL_TAGS,
	SPECIAL_TAGS,
	// Functions
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
