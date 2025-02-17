
/**
 * This script both contructs the changes list of a Move, and executes them
 * when requested, modifying the piece lists according to what moved
 * or was captured, forward or backward.
 * 
 * The change functions here do NOT modify the mesh or animate anything,
 * however, graphicalchanges.ts may rely on these changes present to
 * know how to change the mesh, or what to animate.
 */

import organizedpieces from "./organizedpieces.js";
import coordutil from "../util/coordutil.js";
import events from "./events.js";


// Variables -------------------------------------------------------------------------


/** All Change actions that capture a piece. */
const captureActions = ['capture'];


// Type Definitions-------------------------------------------------------------------------


// @ts-ignore
import type { gamefile } from "./gamefile.js";
// @ts-ignore
import type { Move } from "./movepiece.js";
import type { Coords } from "./movesets.js";

interface Piece {
	type: string // - The type of the piece (e.g. `queensW`).
	coords: Coords // - The coordinates of the piece: `[x,y]`
	index: number // - The index of the piece within the gamefile's piece list.
}

/**
 * Generic type to describe any changes to the board
 */
interface Change {
	// The action is used to differentiated the type of change made and the data it has
	action: 'add' | 'delete' | 'move' | 'capture',
	/** Whether this change affects the main piece moved.
	 * This would be true if the change was for moving the king during castling, but false for moving the rook. */
	main: boolean,
	[changeData: string]: any
}

/**
 * A generic function that takes the changes list of a move, and modifies either
 * the piece lists to reflect that move, or modifies the mesh of the pieces,
 * depending on the function, BUT NOT BOTH.
 */
// eslint-disable-next-line no-unused-vars
type genericChangeFunc = (gamefile: gamefile, change: Change) => void;

/**
 * An actionlist is a dictionary links actions to functions.
 * The function uses the change data for operations. Eg animation, updating mesh, logic 
 * It won't always include every action.
 * If an action is looked up and there isn't a function for it, it's change is ignored
 */
interface ActionList<F extends CallableFunction> {
	[actionName: string]: F
}

/**
 * A change application is used for applying the changelist of a move in both directions.
 */
interface ChangeApplication<F extends CallableFunction> {
	forward: ActionList<F>,
	backward: ActionList<F>
}

/**
 * An object mapping move changes to a function that performs the piece list changes for that action.
 */
const changeFuncs: ChangeApplication<genericChangeFunc> = {
	forward: {
		"add": addPiece,
		"delete": deletePiece,
		"move": movePiece,
		"capture": capturePiece,
	},
	backward: {
		"delete": addPiece,
		"add": deletePiece,
		"move": returnPiece,
		"capture": uncapturePiece,
	}
};


// Adding changes to a Move ----------------------------------------------------------------------------------------


/**
 * Queues a move with catpure
 * Need to differentiate this from move so animations can work and so that royal capture can be recognised
 * @param changes
 * @param piece The piece moved. Its coords are used as starting coords
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param endCoords 
 * @param capturedPiece The piece captured
 */
function queueCapture(changes: Array<Change>, main: boolean, startCoords: Coords, endCoords: Coords, capturedPiece: number) {
	changes.push({ action: 'capture', main, startCoords, endCoords, capturedPiece });
	return changes;
}

/**
 * Queues the addition of a piece to the board
 * @param changes 
 * @param piece the piece to add
 * the pieces index is optional and will get assigned one if none is present
 */
function queueAddPiece(changes: Array<Change>, coords: Coords, type: number) {
	changes.push({ action: 'add', main: false, coords, type }); // It's impossible for an 'add' change to affect the main piece moved, because before this move this piece didn't exist.
	return changes;
};

/**
 * Queues the removal of a piece by adding that Change to the Changes list.
 * @param changes - The running list of Changes for the move.
 * @param piece - The piece this change affects
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 */
function queueDeletePiece(changes: Array<Change>, main: boolean, coords: Coords, type: number) {
	changes.push({ action: 'delete', main, coords, type });
	return changes;
}

/**
 * Moves a piece without capture
 * @param changes 
 * @param piece The piece moved. Its coords are used as starting coords
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param endCoords 
 */
function queueMovePiece(changes: Array<Change>, main: boolean, startCoords: Coords, endCoords: Coords) {
	changes.push({ action: 'move', main, startCoords, endCoords });
	return changes;
}


// Executing changes of a Move ----------------------------------------------------------------------------------------


/**
 * Applies the board changes of a move either forward or backward,
 * either modifying the piece lists, or modifying the mesh,
 * depending on what changeFuncs are passed in.
 */
function runMove(gamefile: gamefile, move: Move, changeFuncs: ChangeApplication<genericChangeFunc>, forward: boolean = true) {
	const funcs = forward ? changeFuncs.forward : changeFuncs.backward;
	applyChanges(gamefile, move.changes, funcs, forward);
}

/**
 * Applies the logical board changes of a change list in the provided order, modifying the piece lists.
 * @param gamefile the gamefile
 * @param changes the changes to apply
 * @param funcs the object contain change funcs
 * @param forward whether to apply changes in forward order (true) or reverse order (false)
 */
function applyChanges(gamefile: gamefile, changes: Array<Change>, funcs: ActionList<genericChangeFunc>, forward: boolean) {
	if (forward) {
		// Iterate forwards through the changes array
		for (const change of changes) {
			if (!(change.action in funcs)) throw Error(`Missing change function for likely-invalid change action "${change.action}"!`);
            funcs[change.action]!(gamefile, change);
		}
	} else {
		// Iterate backwards through the changes array so the move's changes are reverted in the correct order
		for (let i = changes.length - 1; i >= 0; i--) {
			const change = changes[i]!;
			if (!(change.action in funcs)) throw Error(`Missing change function for likely-invalid change action "${change.action}"!`);
            funcs[change.action]!(gamefile, change);
		}
	}
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists
 */
function addPiece(gamefile: gamefile, change: Change) { // desiredIndex optional
	const pieces = gamefile.ourPieces;
	const undefineds = pieces.typeRanges[change['type']].undefineds;
	if (undefineds.length === 0) {
		events.runEvent(gamefile.events, "regenerateLists", gamefile);
	}

	const idx = undefineds.pop()!;
	pieces.XPositions[idx] = change['coords'][0];
	pieces.XPositions[idx] = change['coords'][1];

	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists.
 */
function deletePiece(gamefile: gamefile, change: Change) {
	const pieces = gamefile.ourPieces;
	const idx = pieces.coords.get(coordutil.getKeyFromCoords(change['coords']))!;
	organizedpieces.removePieceFromSpace(idx, pieces);
	pieces.typeRanges[change['type']].undefineds.push(idx);
}


/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * 
 * If the move is a capture, then use capturePiece() instead, so that we can animate it.
 * @param gamefile - The gamefile
 * @param change - the move data
 */
function movePiece(gamefile: gamefile, change: Change) {
	const pieces = gamefile.ourPieces;
	const idx = pieces.coords.get(coordutil.getKeyFromCoords(change['startCoords']))!;

	organizedpieces.removePieceFromSpace(idx, pieces);

	pieces.XPositions[idx] = change['endCoords'][0];
	pieces.YPositions[idx] = change['endCoords'][1];

	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Reverses `movePiece`
 */
function returnPiece(gamefile: gamefile, change: Change) {
	const pieces = gamefile.ourPieces;
	const idx = pieces.coords.get(coordutil.getKeyFromCoords(change['endCoords']))!;

	organizedpieces.removePieceFromSpace(idx, pieces);

	pieces.XPositions[idx] = change['startCoords'][0];
	pieces.YPositions[idx] = change['startCoords'][1];

	organizedpieces.registerPieceInSpace(idx, pieces);
}

/**
 * Captures a piece.
 * 
 * This is differentiated from move changes so it can be animated.
 */
function capturePiece(gamefile: gamefile, change: Change) {
	deletePiece(gamefile, { type: change['capturedPiece'], coords: change['endCoords'], main: change.main, action: "capture" });
	movePiece(gamefile, change);
}

/**
 * Undos a capture
 */
function uncapturePiece(gamefile: gamefile, change: Change) {
	returnPiece(gamefile, change);
	addPiece(gamefile, { type: change['capturedPiece'], coords: change['endCoords'], main: change.main, action: "capture" });
}

/**
 * Gets every captured piece in changes
 */
function getCapturedPieceTypes(move: Move): Set<number> {
	const pieceTypes: Set<number> = new Set();
	for (const change of move.changes) {
		if (captureActions.includes(change.action)) pieceTypes.add(change['capturedPiece']); // This was a capture action
	}
	return pieceTypes;
}

/**
 * Returns true if any piece was captured by the move, whether directly or by special actions.
 */
function wasACapture(move: Move): boolean {
	// Safety net if we ever accidentally call this method too soon.
	// There will never be a valid move with zero changes, that's just absurd.
	if (move.changes.length === 0) throw Error("Move doesn't have it's changes calculated yet, do that before this.");
	for (const change of move.changes) {
		if (captureActions.includes(change.action)) return true; // This was a capture action
	}
	return false;
}

export type {
	genericChangeFunc,
	ActionList,
	ChangeApplication,
	Change,
	Piece,
};

export default {
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	queueCapture,
	getCapturedPieceTypes,
	wasACapture,
	runMove,
	applyChanges,
	changeFuncs,
};