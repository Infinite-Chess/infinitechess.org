
/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 */

// @ts-ignore
import type { MoveDraft } from '../../chess/logic/movepiece.js';
// @ts-ignore
import { FullGame } from '../../chess/logic/gamefile.js';


import boardutil from '../../chess/util/boardutil.js';
import legalmoves from '../../chess/logic/legalmoves.js';
import typeutil from '../../chess/util/typeutil.js';
import selection from './selection.js';
import gameslot from './gameslot.js';

let premoves: MoveDraft[] = [];

/** Gets all pending premoves */
function getPremoves() { return premoves; }
/** Adds an premove */
function addPremove(premove: MoveDraft) {
	premoves.push(premove);
	console.log(getPremoves());
}
/** Clears all pending premoves */
function clearPremoves() { premoves = []; }

/**
 * Processes the premoves array after the opponent's move.
 * Attempts to play the first premove in the list, 
 * clearing it at the first illegal move.
 * @param gamefile The current gamefile object
 */

function processPremoves(gamefile: FullGame) {
	if (premoves.length === 0) return;

	const premove = premoves[0];
	if (!premove) {
		return;
	}
	// Find the piece at the premove's startCoords
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, premove.startCoords);
	if (!piece) {
		clearPremoves();
		return;
	}
	const color = typeutil.getColorFromType(piece.type);

	// Check legality
	const isLegal = legalmoves.checkIfMoveLegal(
		gamefile,
		legalmoves.calculateAll(gamefile, piece),
		premove.startCoords,
		premove.endCoords,
		color
	);

	if (isLegal) {
    	selection.initSelectedPieceInfo(gamefile, piece);
		selection.moveGamefilePiece(gamefile, gameslot.getMesh(), premove.endCoords);
		premoves.shift();
	} else {
		clearPremoves();
	}
}

export default {
	getPremoves,
	addPremove,
	clearPremoves,
	processPremoves,
};