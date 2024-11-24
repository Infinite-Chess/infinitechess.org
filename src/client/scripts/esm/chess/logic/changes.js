import organizedlines from "./organizedlines";
import gamefileutility from "../util/gamefileutility";
import jsutil from "../../util/jsutil";

/**
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import()}
 */

/**
 * @typedef {Object} Piece
 * @property {string} type - The type of the piece (e.g. `queensW`).
 * @property {number[]} coords - The coordinates of the piece: `[x,y]`
 * @property {number} index - The index of the piece within the gamefile's piece list.
 */

/**
 * @typedef {Object} BoardChange
 * @property {string} action
 * @property {Piece} piece
 */

const changeFuncs = {
	"add": addPiece,
	"delete": deletePiece,
	"movePiece": movePiece,
	"addRights": addRights,
	"deleteRights": deleteRights,
	"setPassant": setPassant,
};

const undoFuncs = {
	"delete": addPiece,
	"add": deletePiece,
	"movePiece": returnPiece,
	"addRights": revertRights,
	"deleteRights": revertRights,
	"setPassant": revertPassant,
};

/**
 * @param {Array<BoardChange>} changes 
 * @param {*} type 
 * @param {*} coords 
 * @param {*} desiredIndex 
 */
function queueAddPiece(changes, type, coords, desiredIndex) {
	changes.push({action: 'add', piece: {type: type, coords: coords, index: desiredIndex}});
};

/**
 * 
 * @param {Array<BoardChange>} changes 
 * @param {*} type 
 * @param {*} coords 
 * @param {*} index 
 */
function queueDeletePiece(changes, type, coords, index) {
	changes.push({action: 'delete', piece: {type: type, coords: coords, index: index}});
}

/**
 * 
 * @param {Array<BoardChange>} changes 
 * @param {*} piece 
 * @param {*} endCoords 
 */
function queueMovePiece(changes, piece, endCoords) {
	changes.push({action: 'movePiece', piece: piece, endCoords: endCoords});
}

function queueAddSpecialRights(changes, piece, curRights) {
	changes.push({action: "addRights", piece: piece, curRights: curRights});
}

function queueSetEnPassant(changes, curPassant, newPassant) {
	changes.push({action: "setPassant", curPassant: curPassant, newPassant: newPassant});
}

/**
 * 
 * @param {gamefile} gamefile 
 * @param {Array<BoardChange>} changes 
 */
function applyChanges(gamefile, changes) {
	for (const c of changes) {
		changeFuncs[c.type](gamefile, c);
	}
}

/**
 * 
 * @param {gamefile} gamefile 
 * @param {Array<BoardChange>} changes 
 */
function undoChanges(gamefile, changes) {
	for (const c of changes) {
		undoFuncs[c.type](gamefile, c);
	}
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists, and updates its mesh data.
 * @param {gamefile} gamefile - The gamefile
 * @param {BoardChange} change - the data of the piece to be added
 */
function addPiece(gamefile, change) { // desiredIndex optional
	const piece = change.piece;

	const list = gamefile.ourPieces[piece.type];

	// If no index specified, make the default the first undefined in the list!
	if (piece.index == null) change.piece.index = list.undefineds[0];

	if (piece.index == null) {
		list.push(piece.coords);
	} else { // desiredIndex specified

		const isPieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, piece.coords) != null;
		if (isPieceAtCoords) throw new Error("Can't add a piece on top of another piece!");

		// Remove the undefined from the undefineds list
		const deleteSuccussful = jsutil.deleteValueFromOrganizedArray(gamefile.ourPieces[piece.type].undefineds, piece.index) !== false;
		if (!deleteSuccussful) throw new Error("Index to add a piece has an existing piece on it!");

		list[piece.index] = piece.coords;
	}

	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists, and deletes its mesh data (overwrites with zeros).
 * @param {gamefile} gamefile - The gamefile
 * @param {BoardChange} change 
 */
function deletePiece(gamefile, change) { // piece: { type, index }
	const piece = change.piece;

	const list = gamefile.ourPieces[piece.type];
	gamefileutility.deleteIndexFromPieceList(list, piece.index);

	// Remove captured piece from organized piece lists
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);
}

/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * @param {gamefile} gamefile - The gamefile
 * @param {BoardChange} change - 
 */
function movePiece(gamefile, change) {
	const piece = change.piece;
	const endCoords = change.endCoords;

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = endCoords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);

	// Add the piece to organized lists with new destination
	organizedlines.organizePiece(piece.type, endCoords, gamefile);
}

/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * @param {gamefile} gamefile - The gamefile
 * @param {BoardChange} change
 */
function returnPiece(gamefile, change) {
	const piece = change.piece;
	const endCoords = change.endCoords;

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = piece.coords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, endCoords);

	// Add the piece to organized lists with old destination
	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

/**
 * 
 * @param {gamefile} gamefile 
 * @param {*} change 
 */
function addRights(gamefile, change) {
	gamefile.specialRights[change.piece.coords] = true;
}

function deleteRights(gamefile, change) {
	delete gamefile.specialRights[change.piece.coords];
}

function revertRights(gamefile, change) {
	if (change.curRights === undefined) {
		delete gamefile.specialRights[change.piece.coords];
	} else {
		gamefile.specialRights[change.piece.coords] = change.curRights;
	}
}

/**
 * 
 * @param {gamefile} gamefile 
 * @param {*} change 
 */
function setPassant(gamefile, change) {
	gamefile.enpassant = change.newPassant;
}

function revertPassant(gamefile, change) {
	i
	gamefile.enpassant = change.curPassant;
}

export default {
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	queueAddSpecialRights,
	queueSetEnPassant,
	applyChanges,
	undoChanges,
};