
/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 */

// @ts-ignore
import { FullGame } from '../../chess/logic/gamefile.js';

import boardchanges, { Change } from '../../chess/logic/boardchanges.js';


import gameslot from './gameslot.js';
import { Mesh } from '../rendering/piecemodels.js';
import { meshChanges } from './graphicalchanges.js';
import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import { MoveDraft } from '../../chess/logic/movepiece.js';
import movesequence from './movesequence.js';
import boardutil, { Piece } from '../../chess/util/boardutil.js';
import typeutil from '../../chess/util/typeutil.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';

let premoves: Premove[] = [];
interface Premove extends MoveDraft {
	changes: Array<Change>,
}

/** Gets all pending premoves */
function getPremoves() { return premoves; }

/** Adds an premove */
function addPremove(moveDraft: MoveDraft, piece: Piece) {
	console.log("Adding premove");
	const gamefile = gameslot.getGamefile();
	if (!gamefile) { return; }

	const changes: Change[] = [];

	const capturedPiece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.endCoords);
	if (capturedPiece) boardchanges.queueCapture(changes, true, piece, moveDraft.endCoords, capturedPiece);
	else boardchanges.queueMovePiece(changes, true, piece, moveDraft.endCoords);
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, true); // Logical changes

	const premove: Premove = { ...moveDraft, changes };
	premoves.push(premove);
}

/** Clears all pending premoves */
function clearPremoves() {
	console.log("Clearing premoves");
	premoves = [];
}

function rewindPremoves(gamefile: FullGame) {
	console.log("Rewinding premoves");
	// Reverse the original array so all changes are made in the reverse order they were added
	premoves.slice().reverse().forEach(premove => {
		boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, false); // Logical changes.  false for BACKWARDS
	});
}

function applyPremoves(gamefile: FullGame) {
	console.log("Applying premoves");
	premoves.forEach((premove : Premove) => {
		boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, true); // Logical changes
	});
}

function premoveIsLegal(gamefile: FullGame, premove: Premove): boolean {
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, premove.startCoords);
	if (!piece) { return false; } // Can't premove nothing, also fixes TS may be undefined error

	const color = typeutil.getColorFromType(piece.type);
	if (color !== onlinegame.getOurColor()) { return false; } // Can't premove opponent's piece, happens when opponent captures your piece

	return true; // All checks pass, legal
}

/**
 * Processes the premoves array after the opponent's move.
 * Attempts to play the first premove in the list, 
 * clearing it at the first illegal move.
 * @param gamefile The current gamefile object
 */

function processPremoves(gamefile: FullGame) {
	console.log("Processing premoves");
	if (premoves.length === 0) return;

	const premove : Premove | undefined = premoves[0];
	if (!premove) {
		return;
	}
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) {
		return;
	}

	//rewindPremoves(gamefile);

	//boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, true);

	// Check if the move was legal
	if (premoveIsLegal(gamefile, premove)) {
		// Legal, apply the premove to the real game state
		movesequence.makeMove(gamefile, undefined, premove as MoveDraft); // Make move
    	movesendreceive.sendMove(); // Send move to server

		premoves.shift(); // Remove premove

		applyPremoves(gamefile);
	} else {
		// Illegal, cancel all premoves
		rewindPremovesVisuals();
		clearPremoves();
	}
}

function applyPremovesVisuals() {
	console.log("Applying premove visuals");
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !premoves || premoves.length === 0) return;
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) {
		return;
	}

	premoves.forEach((premove : Premove) => {
		boardchanges.runChanges(mesh, premove.changes, meshChanges, true); // Graphical changes
	});
}

function rewindPremovesVisuals() {
	console.log("Rewinding premove visuals");
	// TODO: Remove premove highlights/arrows/pieces
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) { return; }

	premoves.slice().reverse().forEach(premove => {
		boardchanges.runChanges(mesh, premove.changes, meshChanges, false); // Graphical changes
	});

	//piecemodels.regenAll(gamefile.boardsim, mesh);

	// pieces.clearGhostPieces();
	// arrows.clearPremoveArrows();
}

export default {
	getPremoves,
	addPremove,
	clearPremoves,
	processPremoves,
	applyPremoves,
	applyPremovesVisuals,
	rewindPremoves,
	rewindPremovesVisuals,
};