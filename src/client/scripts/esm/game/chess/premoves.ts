
/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 */

// @ts-ignore
import type { MoveDraft } from '../../chess/logic/movepiece.js';
// @ts-ignore
import { FullGame } from '../../chess/logic/gamefile.js';
// @ts-ignore
import { Coords } from '../../chess/logic/movesets.js';


import boardutil from '../../chess/util/boardutil.js';
import legalmoves from '../../chess/logic/legalmoves.js';
import typeutil from '../../chess/util/typeutil.js';
import selection from './selection.js';
import gameslot from './gameslot.js';
import jsutil from '../../util/jsutil.js';
import movesequence from './movesequence.js';
import piecemodels, { Mesh } from '../rendering/piecemodels.js';

let premoves: MoveDraft[] = [];

/** Gets all pending premoves */
function getPremoves() { return premoves; }
/** Adds an premove */
function addPremove(premove: MoveDraft) {
	premoves.push(premove);
	console.log(premoves);
}
/** Clears all pending premoves */
function clearPremoves() {
	clearPremovesVisuals();
	premoves = [];
}

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
		selection.moveGamefilePiece(gamefile, undefined, premove.endCoords);
		premoves.shift();
	} else {
		clearPremoves();
	}
}

function getSimulatedBoardAfterPremoves(gamefile : FullGame) {
	// Deep copy the real board
	const boardCopy = jsutil.deepCopyObject(gamefile);
	let currentCoords : Coords | null = null;
	for (const premove of premoves) {
		const start = currentCoords ?? premove.startCoords;
		const piece = boardutil.getPieceFromCoords(boardCopy.boardsim.pieces, start);
		if (!piece) break;
		const legal = legalmoves.checkIfMoveLegal(boardCopy, legalmoves.calculateAll(boardCopy, piece), start, premove.endCoords, typeutil.getColorFromType(piece.type));
		if (!legal) break;
		movesequence.makeMove(boardCopy, undefined, { startCoords: start, endCoords: premove.endCoords }, { doGameOverChecks: false, isPremove: true });
		currentCoords = premove.endCoords;
	}
	return boardCopy;
}

function showPremoves(premoves : MoveDraft[]) {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !premoves || premoves.length === 0) return;

	// Always start from a fresh deep copy
	const boardCopy : FullGame = jsutil.deepCopyObject(gamefile);
	const mesh : Mesh | undefined = gameslot.getMesh();

	for (let i = 0; i < premoves.length; ++i) {
		const premove : MoveDraft | undefined = premoves[i];
		if (!premove) break;
		const piece = boardutil.getPieceFromCoords(boardCopy.boardsim.pieces, premove.startCoords);
		if (!piece) break; // Stop simulation if the piece is missing
		const color = typeutil.getColorFromType(piece.type);

		// Defensive: check if the move is legal in the simulated board
		const legal = legalmoves.checkIfMoveLegal(boardCopy,
			legalmoves.calculateAll(boardCopy, piece),
			premove.startCoords,
			premove.endCoords,
			color);
		if (!legal) break;

		movesequence.makeMove(boardCopy, mesh, { startCoords: premove.startCoords, endCoords: premove.endCoords }, { doGameOverChecks: false, isPremove: true });
	}
}

function clearPremovesVisuals() {
	// TODO: Remove premove highlights/arrows/pieces
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !premoves || premoves.length === 0) return;
	const mesh : Mesh | undefined = gameslot.getMesh();
	piecemodels.regenAll(gamefile.boardsim, mesh);

	// pieces.clearGhostPieces();
	// arrows.clearPremoveArrows();
}

export default {
	getPremoves,
	addPremove,
	clearPremoves,
	processPremoves,
	getSimulatedBoardAfterPremoves,
	showPremoves,
	clearPremovesVisuals,
};