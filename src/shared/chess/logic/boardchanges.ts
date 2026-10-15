// src/shared/chess/logic/boardchanges.ts

/**
 * This script both constructs the changes list of a Move, and executes them
 * when requested, modifying the piece lists according to what moved
 * or was captured, forward or backward.
 *
 * The change functions here do NOT modify the mesh or animate anything,
 * however, graphicalchanges.ts may rely on these changes present to
 * know how to change the mesh, or what to animate.
 */

import type { Board } from './boardinit.js';
import type { Piece } from './boardutil.js';
import type { Coords } from '../../util/coordutil.js';
import type { MoveFull } from './movepiece.js';

import jsutil from '../../util/jsutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from './boardutil.js';
import organizedpieces from './organizedpieces.js';
import coordutil, { CoordsKey } from '../../util/coordutil.js';

// Types -----------------------------------------------------------------------

/** Generic type to describe any changes to the board. */
export type Change = {
	/** Whether this change affects the main piece moved.
	 * This would be true if the change was for moving the king during castling, but false for moving the rook. */
	main: boolean;
	/** The piece this change affects: the piece moved, captured, added or deleted. */
	piece: Piece;
} & (
	| {
			/** The type of action this change performs. */
			action: 'add' | 'delete';
	  }
	| {
			action: 'move';
			endCoords: Coords;
			path?: Coords[];
	  }
	| {
			action: 'capture';
			/**
			 * This is used by animations to tell when this piece was captured.
			 * 0 based. 1 means the piece was captured at the 2nd path point.
			 * `-1` implies the end of the path the piece moved along
			 */
			order: number;
	  }
);

/**
 * A generic function that applies one change of a move, modifying either
 * the piece lists or the mesh of the pieces, depending on the function, BUT NOT BOTH.
 */
export type genericChangeFunc<T> = (actiondata: T, change: Change) => void;

/** Maps every change action to the function that applies it. */
type ActionList<F extends CallableFunction> = Record<Change['action'], F>;

/** A change application is used for applying the changelist of a move in both directions. */
export interface ChangeApplication<F extends CallableFunction> {
	forward: ActionList<F>;
	backward: ActionList<F>;
}

// Constants -------------------------------------------------------------------

/**
 * All Change actions that cannot be undone to return to the same board position later in
 * the game, unless in the future it's possible to add pieces mid-game.
 */
const ONE_WAY_ACTIONS: Change['action'][] = ['capture', 'delete'];

/** Maps each move change to the function that performs its piece list changes. */
const CHANGE_FUNCS: ChangeApplication<genericChangeFunc<Board>> = {
	forward: {
		add: addPiece,
		delete: deletePiece,
		move: movePiece,
		capture: deletePiece,
	},
	backward: {
		delete: addPiece,
		add: deletePiece,
		move: returnPiece,
		capture: addPiece,
	},
};

// Adding changes to a Move ----------------------------------------------------

/**
 * Queues the capture of a piece. Distinct from a plain deletion so animations can work,
 * and so that royal capture can be recognised.
 * @param changes - The running list of Changes for the move.
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param piece - The piece captured.
 * @param order - Tells animations when this piece was captured. `-1` implies the end of the path the piece moved along.
 */
function queueCapture(
	changes: Change[],
	main: boolean,
	piece: Piece,
	order: number = -1,
): Change[] {
	const change: Change = { action: 'capture', main, piece, order };
	changes.push(change);
	return changes;
}

/**
 * Queues the addition of a piece to the board.
 * @param changes - The running list of Changes for the move.
 * @param piece - The piece to add. Its index is optional, and is assigned one if absent.
 */
function queueAddPiece(changes: Change[], piece: Piece): Change[] {
	changes.push({ action: 'add', main: false, piece }); // It's impossible for an 'add' change to affect the main piece moved, because before this move this piece didn't exist.
	return changes;
}

/**
 * Queues the removal of a piece by adding that Change to the Changes list.
 * @param changes - The running list of Changes for the move.
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param piece - The piece this change affects.
 */
function queueDeletePiece(changes: Change[], main: boolean, piece: Piece): Change[] {
	changes.push({ action: 'delete', main, piece });
	return changes;
}

/**
 * Moves a piece without capture.
 * @param changes - The running list of Changes for the move.
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param piece - The piece moved. Its coords are used as the starting coords.
 * @param endCoords - Where the piece lands.
 * @param path - The waypoints the piece travels through, for animation.
 */
function queueMovePiece(
	changes: Change[],
	main: boolean,
	piece: Piece,
	endCoords: Coords,
	path?: Coords[],
): Change[] {
	const change: Change = { action: 'move', main, piece, endCoords };
	if (path !== undefined) change.path = path;
	changes.push(change);
	return changes;
}

// Executing changes of a Move -------------------------------------------------

/**
 * Applies the board changes of a move either forward or backward,
 * either modifying the piece lists, or modifying the mesh,
 * depending on what changeFuncs are passed in.
 */
function runChanges<T>(
	actiondata: T,
	changes: Change[],
	changeFuncs: ChangeApplication<genericChangeFunc<T>>,
	forward: boolean = true,
): void {
	if (forward) {
		for (const change of changes) changeFuncs.forward[change.action](actiondata, change);
	} else {
		// Iterate backwards through the changes array so the move's changes are reverted in the correct order
		for (let i = changes.length - 1; i >= 0; i--) {
			const change = changes[i]!;
			changeFuncs.backward[change.action](actiondata, change);
		}
	}
}

// Standard Change Functions ---------------------------------------------------

/**
 * Most basic add-a-piece method. Adds it to the board's piece list,
 * and organizes the piece in the organized lists.
 */
function addPiece(boardsim: Board, change: Change): void {
	const pieces = boardsim.pieces;
	const typedata = pieces.typeRanges.get(change.piece.type);
	if (typedata === undefined)
		throw Error(`Type: "${typeutil.debugType(change.piece.type)}" is not expected to be in the game`); // prettier-ignore
	let idx: number;
	if (change.piece.index === -1) {
		// Does not have an index yet, assign it one from undefined list
		if (typedata.undefineds.length === 0) {
			if (
				organizedpieces.getTypeUndefinedsBehavior(
					change.piece.type,
					boardsim.editor,
					boardsim.gameRules.promotion,
				) === 0
			)
				throw Error(`Type: ${typeutil.debugType(change.piece.type)} is not expected to be added after initial position!`); // prettier-ignore
			organizedpieces.regenerateLists(
				boardsim.pieces,
				boardsim.editor,
				boardsim.gameRules.promotion,
			);
		}

		idx = typedata.undefineds.shift()!;
		change.piece.index = boardutil.getRelativeIdx(pieces, idx);
	} else {
		idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range
		const { found, index } = jsutil.binarySearch(typedata.undefineds, idx);
		if (!found)
			throw Error(`Newly added piece ${JSON.stringify(change.piece)} attempted to overwrite an occupied index`); // prettier-ignore
		typedata.undefineds.splice(index, 1);
	}
	pieces.XPositions[idx] = change.piece.coords[0];
	pieces.YPositions[idx] = change.piece.coords[1];
	// Don't need to set its type, because its spot in the type range already has its type.

	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Most basic delete-a-piece method. Deletes it from the board's piece list,
 * and from the organized lists.
 */
function deletePiece(boardsim: Board, change: Change): void {
	const pieces = boardsim.pieces;
	const typedata = pieces.typeRanges.get(change.piece.type);

	if (typedata === undefined)
		throw Error(`Type: "${typeutil.debugType(change.piece.type)}" is not expected to be in the game`); // prettier-ignore
	if (change.piece.index === -1) throw Error('Piece has not been allocated in organizedPieces');

	const idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range

	organizedpieces.removePieceFromSpace(idx, pieces);
	jsutil.addElementToOrganizedArray(typedata.undefineds, idx);

	// Undefineds hold [0,0] (see the OrganizedPieces coords invariant).
	pieces.XPositions[idx] = 0n;
	pieces.YPositions[idx] = 0n;
	// Don't need to delete its type because every spot in a type range is expected to have the same type.
}

/**
 * Most basic move-a-piece method. Adjusts its coordinates in the board's piece lists,
 * and reorganizes the piece in the organized lists.
 */
function movePiece(boardsim: Board, change: Change): void {
	if (change.action !== 'move')
		throw new Error(`movePiece called with a non-move change: ${change.action}`);

	const pieces = boardsim.pieces;
	const idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range

	organizedpieces.removePieceFromSpace(idx, pieces);
	pieces.XPositions[idx] = change.endCoords[0];
	pieces.YPositions[idx] = change.endCoords[1];
	organizedpieces.registerPieceInSpace(idx, pieces);
}

/** Reverses `movePiece`. */
function returnPiece(boardsim: Board, change: Change): void {
	if (change.action !== 'move')
		throw new Error(`returnPiece called with a non-move change: ${change.action}`);

	const pieces = boardsim.pieces;
	const range = pieces.typeRanges.get(change.piece.type)!;
	const idx = change.piece.index + range.start;

	organizedpieces.removePieceFromSpace(idx, pieces);

	pieces.XPositions[idx] = change.piece.coords[0];
	pieces.YPositions[idx] = change.piece.coords[1];

	organizedpieces.registerPieceInSpace(idx, pieces);
}

// Other Change Functions ------------------------------------------------------

/**
 * This modifies only a Position Map<CoordsKey, number> where number is the type of piece.
 * It does NOT modify a gamefile or its organized pieces.
 * This also only works applying a move's changes FORWARD.
 *
 * This is intended for updating a simplified board state, such as a `VariantOptions` position.
 */
function runChanges_Position(position: Map<CoordsKey, number>, changes: Change[]): void {
	for (const change of changes) {
		const startCoordsKey = coordutil.getKeyFromCoords(change.piece.coords);
		switch (change.action) {
			case 'move':
				position.delete(startCoordsKey);
				position.set(coordutil.getKeyFromCoords(change.endCoords), change.piece.type);
				break;
			case 'capture':
			case 'delete':
				position.delete(startCoordsKey);
				break;
			case 'add':
				position.set(startCoordsKey, change.piece.type);
				break;
			default:
				throw Error(`Unknown change: ${JSON.stringify(change satisfies never)}`);
		}
	}
}

// Helper Functions ------------------------------------------------------------

/** Gets the type of every piece the move captured. */
function getCapturedPieceTypes(move: MoveFull): Set<number> {
	const pieceTypes: Set<number> = new Set();
	move.changes.forEach((change) => {
		if (change.action === 'capture') pieceTypes.add(change.piece.type);
	});
	return pieceTypes;
}

/** Whether the move captured any piece, whether directly or by special actions. */
function isCapture(move: MoveFull): boolean {
	return move.changes.some((change) => change.action === 'capture');
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	ONE_WAY_ACTIONS,
	CHANGE_FUNCS,
	// Adding changes to a Move
	queueCapture,
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	// Executing changes of a Move
	runChanges,
	runChanges_Position,
	// Helper Functions
	getCapturedPieceTypes,
	isCapture,
};
