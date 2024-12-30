// @ts-ignore
import organizedlines from "./organizedlines.js";
// @ts-ignore
import gamefileutility from "../util/gamefileutility.js";
// @ts-ignore
import jsutil from "../../util/jsutil.js";

// @ts-ignore
import type { gamefile } from "./gamefile.js";
import type { Coords } from "./movesets.js";
// @ts-ignore
import type { Move } from "../util/moveutil.js";


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
	action: 'add' | "delete" | "move" | "capture", 
	[changeData: string]: any
}

/**
 * A change func takes change data and alters the board depending on the change
 */
// I dislike eslint
// eslint-disable-next-line no-unused-vars
type genericChangeFunc = (gamefile: gamefile, change: any) => void;

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
	forward: ActionList<F>

	backward: ActionList<F>
}

// This is the logical board change application
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

// All queue functions queue a change to the board.
// They add to a changelist which is then executed using a set of changefuncs, see above.

/**
 * Queues a move with catpure
 * Need to differentiate this from move so animations can work and so that royal capture can be recognised
 * @param changes
 * @param piece The piece moved. Its coords are used as starting coords
 * @param endCoords 
 * @param capturedPiece The piece captured
 */
function queueCapture(changes: Array<Change>, piece: Piece, endCoords: Coords, capturedPiece: Piece) {
	changes.push({action: 'capture', piece: piece, endCoords: endCoords, capturedPiece: capturedPiece});
	return changes;
}

/**
 * Queues the addition of a piece to the board
 * @param changes 
 * @param piece the piece to add
 * the pieces index is optional and will get assigned one if none is present
 */
function queueAddPiece(changes: Array<Change>, piece: Piece) {
	changes.push({action: 'add', piece: piece});
	return changes;
};

/**
 * Queues the removal of a piece
 * @param changes 
 * @param piece 
 */
function queueDeletePiece(changes: Array<Change>, piece: Piece) {
	changes.push({action: 'delete', piece: piece});
	return changes;
}

/**
 * Moves a piece without capture
 * @param changes 
 * @param piece The piece moved. Its coords are used as starting coords
 * @param endCoords 
 */
function queueMovePiece(changes: Array<Change>, piece: Piece, endCoords: Coords) {
	changes.push({action: 'move', piece: piece, endCoords: endCoords});
	return changes;
}

/**
 * Apply changes in changelist according to changefuncs
 * @param gamefile the gamefile
 * @param changes the changes to apply
 * @param funcs the object contain change funcs
 */
function applyChanges(gamefile: gamefile, changes: Array<Change>, funcs: ActionList<genericChangeFunc>) {
	for (const c of changes) {
		if (!(c.action in funcs)) continue;
		funcs[c.action]!(gamefile, c);
	}
}

/**
 * Applies a moves changes in a direction
 * @param gamefile 
 * @param move 
 * @param changeFuncs 
 * @param forward 
 */
function runMove(gamefile: gamefile, move: Move, changeFuncs: ChangeApplication<genericChangeFunc>, forward: boolean = true) {
	const funcs = forward ? changeFuncs.forward : changeFuncs.backward;
	const changes = forward ? move.changes : [...move.changes].reverse();
	applyChanges(gamefile, changes, funcs);
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists
 * @param gamefile 
 * @param change
 */
function addPiece(gamefile: gamefile, change: Change) { // desiredIndex optional
	const piece = change['piece'];

	const list = gamefile.ourPieces[piece.type];

	// If no index specified, make the default the first undefined in the list!
	if (piece.index === undefined) change['piece'].index = list.undefineds[0];

	if (piece.index === undefined) {
		list.push(piece.coords);
	} else { // desiredIndex specified

		const isPieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, piece.coords) !== undefined;
		if (isPieceAtCoords) throw new Error("Can't add a piece on top of another piece!");

		// Remove the undefined from the undefineds list
		const deleteSuccussful = jsutil.deleteValueFromOrganizedArray(gamefile.ourPieces[piece.type].undefineds, piece.index) !== undefined;
		if (!deleteSuccussful) throw new Error("Index to add a piece has an existing piece on it!");

		list[piece.index] = piece.coords;
	}

	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists.
 * @param gamefile 
 * @param change 
 */
function deletePiece(gamefile: gamefile, change: Change) { // piece: { type, index }
	const piece = change['piece'];

	const list = gamefile.ourPieces[piece.type];
	gamefileutility.deleteIndexFromPieceList(list, piece.index);

	// Remove captured piece from organized piece lists
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);
}


/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * @param gamefile - The gamefile
 * @param change - the move data
 * change.piece - the piece to move
 * the piece coords is the start coords
 * change,endCoords - the coords the piece is moved to
 */
function movePiece(gamefile: gamefile, change: Change) {
	const piece = change['piece'];
	const endCoords = change['endCoords'];

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = endCoords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);

	// Add the piece to organized lists with new destination
	organizedlines.organizePiece(piece.type, endCoords, gamefile);
}

/**
 * Reverses `movePiece`
 * @param gamefile 
 * @param change 
 */
function returnPiece(gamefile: gamefile, change: Change) {
	const piece = change['piece'];
	const endCoords = change['endCoords'];

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = piece.coords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, endCoords);

	// Add the piece to organized lists with old destination
	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

/**
 * Captures a piece
 * This is differentiated from move changes so it can be animated
 * @param gamefile 
 * @param change 
 */
function capturePiece(gamefile: gamefile, change: Change) {
	deletePiece(gamefile, {piece: change['capturedPiece'], action: "add"});
	movePiece(gamefile, change);
}

// Undoes a capture
function uncapturePiece(gamefile: gamefile, change: Change) {
	returnPiece(gamefile, change);
	addPiece(gamefile, {piece: change['capturedPiece'], action:"add"});
}

const captureActions = new Set("capture");
/**
 * Gets every captured piece in changes
 * @param move 
 * @returns 
 */
function getCapturedPieces(move: Move): Piece[] {
	const pieces: Piece[] = [];
	for (const c of move.changes) {
		if (!(c.action in captureActions)) continue;
		pieces.push(c['capturedPiece']);
	}
	return pieces;
}

function wasACapture(move: Move): boolean {
	for (const c of move.changes) {
		if ((c.action in captureActions)) return true;
	}
	return false;
}

export type {
	genericChangeFunc,
	ActionList,
	ChangeApplication,
	Change,
};

export default {
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	queueCapture,

	getCapturedPieces,
	wasACapture,
	runMove,
	applyChanges,
	changeFuncs,
};