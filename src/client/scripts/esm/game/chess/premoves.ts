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
import movepiece, { MoveDraft } from '../../chess/logic/movepiece.js';
import movesequence from './movesequence.js';
import boardutil from '../../chess/util/boardutil.js';
import typeutil from '../../chess/util/typeutil.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import legalmoves from '../../chess/logic/legalmoves.js';

let premoves: Premove[] = [];
interface Premove extends MoveDraft {
	changes: Array<Change>,
}

/** Gets all pending premoves */
function getPremoves() { return premoves; }

/** Adds an premove */
function addPremove(moveDraft: MoveDraft) {
	console.log("Adding premove");
	const gamefile = gameslot.getGamefile();
	if (!gamefile) { return; }

	rewindPremovesVisuals();
	/*const changes: Change[] = [];

	const capturedPiece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.endCoords);
	if (capturedPiece) boardchanges.queueCapture(changes, true, piece, moveDraft.endCoords, capturedPiece);
	else boardchanges.queueMovePiece(changes, true, piece, moveDraft.endCoords);
	boardchanges.runChanges(gamefile, changes, boardchanges.changeFuncs, true); // Logical changes

	const premove: Premove = { ...moveDraft, changes };
	premoves.push(premove);*/

	// Use movepiece.generateMove to get all special move logic
	const move = movepiece.generateMove(gamefile, moveDraft);
	const premove: Premove = { ...moveDraft, ...move, changes: move.changes };
	boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, true); // Logical changes
	premoves.push(premove);
	console.log(premoves);

	applyPremovesVisuals();
}

/** Clears all pending premoves */
function clearPremoves() {
	premoves = [];
}

/** Cancels all premoves */
function cancelPremoves(gamefile : FullGame) {
	console.log("Clearing premoves");
	rewindPremovesVisuals();
	rewindPremoves(gamefile);
	clearPremoves();
}

function rewindPremoves(gamefile: FullGame) {
	// Reverse the original array so all changes are made in the reverse order they were added
	premoves.slice().reverse().forEach(premove => {
		for (let j = 0; j < premove.changes.length; j++) {
			const change = premove.changes[j];
			if (!change || !change.action) { continue; } // Skip if change is undefined or has no action

			if (change.action === 'capture') {
				const capturedPiece = change.piece;
				if (!capturedPiece) {
					// If any capture is not possible, cancel all premoves immediately
					clearPremoves();
					return;
				}
			}
		}

		boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, false); // Logical changes.  false for BACKWARDS
	});
}

function applyPremoves(gamefile: FullGame) {
	for (let i = 0; i < premoves.length; i++) {
		const premove = premoves[i];
		if (!premove || !premove.changes || premove.changes.length === 0) {
			continue; // Skip if premove is undefined or has no changes
		}

		for (let j = 0; j < premove.changes.length; j++) {
			const change = premove.changes[j];
			if (!change || !change.action) {
				continue; // Skip if change is undefined or has no action
			}

			const movingPiece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, change.piece.coords);
			if (!movingPiece) {
				clearPremoves();
				return;
			}

			const ourColor = typeutil.getColorFromType(movingPiece.type);

			if (change.action === 'capture') {
				// Only capture changes have endCoords and capturedPiece
				const endCoords = (change as any).endCoords;
				const destPiece = endCoords ? boardutil.getPieceFromCoords(gamefile.boardsim.pieces, endCoords) : undefined;
				if (!destPiece || typeutil.getColorFromType(destPiece.type) === ourColor) {
					// Convert to move if possible
					(change as any).action = 'move';
					if ('capturedPiece' in change) delete (change as any).capturedPiece;
				}
			} else if (change.action === 'move') {
				// Only move changes have endCoords
				const endCoords = (change as any).endCoords;
				const destPiece = endCoords ? boardutil.getPieceFromCoords(gamefile.boardsim.pieces, endCoords) : undefined;
				if (destPiece && typeutil.getColorFromType(destPiece.type) !== ourColor) {
					// Convert to capture
					(change as any).action = 'capture';
					(change as any).capturedPiece = destPiece;
				}
			}
		}
		boardchanges.runChanges(gamefile, premove.changes, boardchanges.changeFuncs, true);
	}
}

function premoveIsLegal(gamefile: FullGame, premove: Premove): boolean {
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, premove.startCoords);
	if (!piece) { return false; } // Can't premove nothing, also fixes TS may be undefined error

	const color = typeutil.getColorFromType(piece.type);
	if (color !== onlinegame.getOurColor()) { return false; } // Can't premove opponent's piece, happens when opponent captures your piece

	// Check if the move is legal
	const isLegal = legalmoves.checkIfMoveLegal(gamefile, legalmoves.calculateAll(gamefile, piece), piece.coords, premove.endCoords, color);
	if (!isLegal) { return false; } // Illegal move

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
	// TODO: Remove premove highlights/arrows/pieces
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) { return; }

	premoves.slice().reverse().forEach(premove => {
		// TODO: Check if piece still exists
		boardchanges.runChanges(mesh, premove.changes, meshChanges, false); // Graphical changes.  false for BACKWARDS
	});

	//piecemodels.regenAll(gamefile.boardsim, mesh);

	// pieces.clearGhostPieces();
	// arrows.clearPremoveArrows();
}

export default {
	getPremoves,
	addPremove,
	clearPremoves,
	cancelPremoves,
	processPremoves,
	applyPremoves,
	applyPremovesVisuals,
	rewindPremoves,
	rewindPremovesVisuals,
};