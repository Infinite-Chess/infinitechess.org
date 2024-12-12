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

interface Change {
	action: string
	[changeData: string]: any
}

interface ActionList<T extends CallableFunction> {
	[actionName: string]: T
}

// I dislike eslint
// eslint-disable-next-line no-unused-vars
type genericChangeFunc = (gamefile: gamefile, change: any) => void;

interface ChangeApplication {
	forward: ActionList<genericChangeFunc>

	backward: ActionList<genericChangeFunc>
}

const changeFuncs: ChangeApplication = {
	forward: {
		"add": addPiece,
		"delete": deletePiece,
		"movePiece": movePiece,
		"capturePiece": capturePiece,
		"setRights": setRights,
		"setPassant": setPassant,
	},

	backward: {
		"delete": addPiece,
		"add": deletePiece,
		"movePiece": returnPiece,
		"capturePiece": uncapturePiece,
		"setRights": revertRights,
		"setPassant": revertPassant,
	}
};

function queueCaputure(changes: Array<Change>, piece: Piece, endCoords: Coords, capturedPiece: Piece) {
	changes.push({action: 'capturePiece', piece: piece, endCoords: endCoords, capturedPiece: capturedPiece}); // Need to differentiate this from move so animations can work
	return changes;
}

function queueAddPiece(changes: Array<Change>, piece: Piece) {
	changes.push({action: 'add', piece: piece});
	return changes;
};

function queueDeletePiece(changes: Array<Change>, piece: Piece) {
	changes.push({action: 'delete', piece: piece});
	return changes;
}

function queueMovePiece(changes: Array<Change>, piece: Piece, endCoords: Coords) {
	changes.push({action: 'movePiece', piece: piece, endCoords: endCoords});
	return changes;
}

function queueSetSpecialRights(changes: Array<Change>, coords: string, curRights: any, rights: any) {
	changes.push({action: "setRights", coords: coords, curRights: curRights, rights: rights});
	return changes;
}

function queueSetEnPassant(changes: Array<Change>, curPassant: any, newPassant: any) {
	changes.push({action: "setPassant", curPassant: curPassant, newPassant: newPassant});
	return changes;
}

function applyChanges(gamefile: gamefile, changes: Array<Change>, funcs: ActionList<genericChangeFunc>) {
	for (const c of changes) {
		if (!(c.action in funcs)) continue;
		funcs[c.action]!(gamefile, c);
	}
}

function runMove(gamefile: gamefile, move: Move, changeFuncs: ChangeApplication, forward: boolean = true) {
	const funcs = forward ? changeFuncs.forward : changeFuncs.backward;
	applyChanges(gamefile, move.changes, funcs);
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists, and updates its mesh data.
 * @param gamefile - The gamefile
 * @param change - the data of the piece to be added
 */
function addPiece(gamefile: gamefile, change: Change) { // desiredIndex optional
	const piece = change['piece'];

	const list = gamefile.ourPieces[piece.type];

	// If no index specified, make the default the first undefined in the list!
	if (piece.index == null) change['piece'].index = list.undefineds[0];

	if (piece.index == null) {
		list.push(piece.coords);
	} else { // desiredIndex specified

		const isPieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, piece.coords) != null;
		if (isPieceAtCoords) throw new Error("Can't add a piece on top of another piece!");

		// Remove the undefined from the undefineds list
		const deleteSuccussful = jsutil.deleteValueFromOrganizedArray(gamefile.ourPieces[piece.type].undefineds, piece.index) !== undefined;
		if (!deleteSuccussful) throw new Error("Index to add a piece has an existing piece on it!");

		list[piece.index] = piece.coords;
	}

	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

function deletePiece(gamefile: gamefile, change: Change) { // piece: { type, index }
	const piece = change['piece'];

	const list = gamefile.ourPieces[piece.type];
	gamefileutility.deleteIndexFromPieceList(list, piece.index);

	// Remove captured piece from organized piece lists
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);
}

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

function capturePiece(gamefile: gamefile, change: Change) {
	deletePiece(gamefile, {piece: change['capturedPiece'], action: ""});
	movePiece(gamefile, change);
}

function uncapturePiece(gamefile: gamefile, change: Change) {
	returnPiece(gamefile, change);
	addPiece(gamefile, {piece: change['capturedPiece'], action:""});
}

function setRights(gamefile: gamefile, change: Change) {
	if (change['rights'] === undefined) {
		delete gamefile.specialRights[change['coords']];
	} else {
		gamefile.specialRights[change['coords']] = change['rights'];
	}
}

function revertRights(gamefile: gamefile, change: Change) {
	if (change['curRights'] === undefined) {
		delete gamefile.specialRights[change['coords']];
	} else {
		gamefile.specialRights[change['coords']] = change['curRights'];
	}
}

function setPassant(gamefile: gamefile, change: Change) {
	gamefile.enpassant = change['newPassant'];
}

function revertPassant(gamefile: gamefile, change: Change) {
	if (change['curPassant'] === undefined) {
		delete gamefile.enpassant;
	} else {
		gamefile.enpassant = change['curPassant'];
	}
}

export type {
	ActionList,
	ChangeApplication,
	Change,
};

export default {
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	queueCaputure,
	queueSetSpecialRights,
	queueSetEnPassant,

	runMove,
	applyChanges,
	changeFuncs,
};