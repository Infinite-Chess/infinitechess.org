// src/shared/chess/logic/boardchanges.ts

/**
 * This script both contructs the changes list of a Move, and executes them
 * when requested, modifying the piece lists according to what moved
 * or was captured, forward or backward.
 *
 * The change functions here do NOT modify the mesh or animate anything,
 * however, graphicalchanges.ts may rely on these changes present to
 * know how to change the mesh, or what to animate.
 */

import jsutil from '../../util/jsutil.js';
import typeutil from '../util/typeutil.js';
import boardutil from '../util/boardutil.js';
import organizedpieces from './organizedpieces.js';
import coordutil, { CoordsKey } from '../util/coordutil.js';

// Variables -------------------------------------------------------------------------

/** All Change actions that cannot be undone to return to the same board position later in the game, unless in the future it's possible to add pieces mid-game. */
const oneWayActions: string[] = ['capture', 'delete'];

// Type Definitions-------------------------------------------------------------------------

import type { Move } from './movepiece.js';
import type { Coords } from '../util/coordutil.js';
import type { Piece } from '../util/boardutil.js';
import type { FullGame } from './gamefile.js';

/**
 * Generic type to describe any changes to the board
 */
type Change = {
	/** Whether this change affects the main piece moved.
	 * This would be true if the change was for moving the king during castling, but false for moving the rook. */
	main: boolean;
	/** The main piece affected by the move. If this is a move/capture action, it's the piece moved. If it's an add/delete action, it's the piece added/deleted. */
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
 * A generic function that takes the changes list of a move, and modifies either
 * the piece lists to reflect that move, or modifies the mesh of the pieces,
 * depending on the function, BUT NOT BOTH.
 */
type genericChangeFunc<T> = (_actiondata: T, _change: Change) => void;

/**
 * An actionlist is a dictionary links actions to functions.
 * The function uses the change data for operations. Eg animation, updating mesh, logic
 * It won't always include every action.
 * If an action is looked up and there isn't a function for it, it's change is ignored
 */
interface ActionList<F extends CallableFunction> {
	[actionName: string]: F;
}

/**
 * A change application is used for applying the changelist of a move in both directions.
 */
interface ChangeApplication<F extends CallableFunction> {
	forward: ActionList<F>;
	backward: ActionList<F>;
}

/**
 * An object mapping move changes to a function that performs the piece list changes for that action.
 */
const changeFuncs: ChangeApplication<genericChangeFunc<FullGame>> = {
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

// Adding changes to a Move ----------------------------------------------------------------------------------------

/**
 * Queues a move with catpure
 * Need to differentiate this from move so animations can work and so that royal capture can be recognised
 * @param changes
 * @param piece The piece captured.
 * @param main Whether this change is affecting the main piece moved, not a secondary piece.
 * @param order This is used by animations to tell when this piece was captured. `-1` implies the end of the path the piece moved along
 */
function queueCapture(
	changes: Array<Change>,
	main: boolean,
	piece: Piece,
	order: number = -1,
): Change[] {
	const change: Change = { action: 'capture', main, piece, order };
	changes.push(change);
	return changes;
}

/**
 * Queues the addition of a piece to the board
 * @param changes
 * @param piece the piece to add
 * the pieces index is optional and will get assigned one if none is present
 */
function queueAddPiece(changes: Array<Change>, piece: Piece): Change[] {
	changes.push({ action: 'add', main: false, piece }); // It's impossible for an 'add' change to affect the main piece moved, because before this move this piece didn't exist.
	return changes;
}

/**
 * Queues the removal of a piece by adding that Change to the Changes list.
 * @param changes - The running list of Changes for the move.
 * @param piece - The piece this change affects
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 */
function queueDeletePiece(changes: Array<Change>, main: boolean, piece: Piece): Change[] {
	changes.push({ action: 'delete', main, piece });
	return changes;
}

/**
 * Moves a piece without capture
 * @param changes
 * @param piece The piece moved. Its coords are used as starting coords
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param endCoords
 */
function queueMovePiece(
	changes: Array<Change>,
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

// Executing changes of a Move ----------------------------------------------------------------------------------------

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
	const funcs = forward ? changeFuncs.forward : changeFuncs.backward;
	applyChanges(actiondata, changes, funcs, forward);
}

/**
 * Applies the logical board changes of a change list in the provided order, modifying the piece lists.
 * @param actiondata the data to apply the changes to
 * @param changes the changes to apply
 * @param funcs the object contain change funcs
 * @param forward whether to apply changes in forward order (true) or reverse order (false)
 */
function applyChanges<T>(
	actiondata: T,
	changes: Array<Change>,
	funcs: ActionList<genericChangeFunc<T>>,
	forward: boolean,
): void {
	if (forward) {
		// Iterate forwards through the changes array
		for (const change of changes) {
			if (!(change.action in funcs))
				throw Error(
					`Missing change function for likely-invalid change action "${change.action}"!`,
				);
			funcs[change.action]!(actiondata, change);
		}
	} else {
		// Iterate backwards through the changes array so the move's changes are reverted in the correct order
		for (let i = changes.length - 1; i >= 0; i--) {
			const change = changes[i]!;
			if (!(change.action in funcs))
				throw Error(
					`Missing change function for likely-invalid change action "${change.action}"!`,
				);
			funcs[change.action]!(actiondata, change);
		}
	}
}

// Standard Chagne Functions --------------------------------------------------------------------------------------

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists
 */
function addPiece({ boardsim, basegame }: FullGame, change: Change): void {
	// desiredIndex optional
	const pieces = boardsim.pieces;
	const typedata = pieces.typeRanges.get(change.piece.type);
	if (typedata === undefined)
		throw Error(
			`Type: "${typeutil.debugType(change.piece.type)}" is not expected to be in the game`,
		);
	let idx: number;
	if (change.piece.index === -1) {
		// Does not have an index yet, assign it one from undefined list
		if (typedata.undefineds.length === 0) {
			if (
				organizedpieces.getTypeUndefinedsBehavior(
					change.piece.type,
					boardsim.editor,
					basegame.gameRules.promotionsAllowed,
				) === 0
			)
				throw Error(
					`Type: ${typeutil.debugType(change.piece.type)} is not expected to be added after initial position!`,
				);
			organizedpieces.regenerateLists(
				boardsim.pieces,
				boardsim.editor,
				basegame.gameRules.promotionsAllowed,
			);
		}

		idx = typedata.undefineds.shift()!;
		change.piece.index = boardutil.getRelativeIdx(pieces, idx);
	} else {
		idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range
		const { found, index } = jsutil.binarySearch(typedata.undefineds, idx);
		if (!found)
			throw Error(
				`Newly added piece ${JSON.stringify(change.piece)} attemped to overwrite an occupied index`,
			);
		typedata.undefineds.splice(index, 1);
	}
	pieces.XPositions[idx] = change.piece.coords[0];
	pieces.YPositions[idx] = change.piece.coords[1];
	// Don't need to set it's type, because it's spot in the type range already has its type.

	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists.
 */
function deletePiece({ boardsim }: FullGame, change: Change): void {
	const pieces = boardsim.pieces;
	const typedata = pieces.typeRanges.get(change.piece.type);

	if (typedata === undefined)
		throw Error(
			`Type: "${typeutil.debugType(change.piece.type)}" is not expected to be in the game`,
		);
	if (change.piece.index === -1) throw Error('Piece has not been allocated in organizedPieces');

	const idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range

	organizedpieces.removePieceFromSpace(idx, pieces);
	jsutil.addElementToOrganizedArray(typedata.undefineds, idx);

	// Set the undefined piece's coordinates to [0,0] to keep things tidy.
	pieces.XPositions[idx] = 0n;
	pieces.YPositions[idx] = 0n;
	// Don't need to delete its type because every spot in a type range is expected to have the same type.
}

/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 *
 * If the move is a capture, then use capturePiece() instead, so that we can animate it.
 * @param gamefile - The gamefile
 * @param change - the move data
 */
function movePiece({ boardsim }: FullGame, change: Change): void {
	if (change.action !== 'move')
		throw new Error(`movePiece called with a non-move change: ${change.action}`);

	const pieces = boardsim.pieces;
	const idx = boardutil.getAbsoluteIdx(pieces, change.piece); // Remove the relative-ness to the start of its type range

	organizedpieces.removePieceFromSpace(idx, pieces);
	pieces.XPositions[idx] = change.endCoords[0];
	pieces.YPositions[idx] = change.endCoords[1];
	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Reverses `movePiece`
 */
function returnPiece({ boardsim }: FullGame, change: Change): void {
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

// Other Change Functions -----------------------------------------------------------------------------------

/**
 * This modifies only a Position Map<CoordsKey, number> where number is the type of piece.
 * It does NOT modify a gamefile or its organized pieces.
 * This also only works applying a move's changes FORWARD.
 *
 * This is intended for updating a simplified board state, one that is used in gamecompressor.GameToPosition
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
				position.delete(startCoordsKey);
				break;
			case 'add':
				position.set(startCoordsKey, change.piece.type);
				break;
			case 'delete':
				position.delete(startCoordsKey);
				break;
			default:
				// @ts-ignore
				throw Error(`Unknown change action: ${change.action}`);
		}
	}
}

// Helper Functions ----------------------------------------------------------------------------------------

/**
 * Gets every captured piece in changes
 */
function getCapturedPieceTypes(move: Move): Set<number> {
	const pieceTypes: Set<number> = new Set();
	move.changes.forEach((change) => {
		if (change.action === 'capture') pieceTypes.add(change.piece.type);
	});
	return pieceTypes;
}

/**
 * Returns true if any piece was captured by the move, whether directly or by special actions.
 */
function wasACapture(move: Move): boolean {
	// Safety net if we ever accidentally call this method too soon.
	// There will never be a valid move with zero changes, that's just absurd.
	if (move.changes.length === 0)
		throw Error("Move doesn't have it's changes calculated yet, do that before this.");
	return move.changes.some((change) => change.action === 'capture');
}

// Exports ----------------------------------------------------------------------------------------

export type { genericChangeFunc, ActionList, ChangeApplication, Change };

export default {
	changeFuncs,
	queueCapture,
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	runChanges,
	runChanges_Position,

	getCapturedPieceTypes,
	wasACapture,
	oneWayActions,
	applyChanges,
};
