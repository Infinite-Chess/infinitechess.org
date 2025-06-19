
/**
 * This script handles the processing and execution of premoves
 * after the opponent's move.
 */

// @ts-ignore
import { FullGame } from '../../chess/logic/gamefile.js';
// @ts-ignore
import { Coords } from '../../chess/logic/movesets.js';

import boardchanges, { Change } from '../../chess/logic/boardchanges.js';


import gameslot from './gameslot.js';
import { Mesh } from '../rendering/piecemodels.js';
import { meshChanges } from './graphicalchanges.js';
import { Piece } from '../../chess/util/boardutil.js';
import movesequence from './movesequence.js';
import movesendreceive from '../misc/onlinegame/movesendreceive.js';
import { MoveDraft } from '../../chess/logic/movepiece.js';

let premoves: Change[][] = [];

/** Gets all pending premoves */
function getPremoves() { return premoves; }

/** Adds an premove */
function addPremove(piece: Piece, coords: Coords) {
	console.log("Adding premove");
	const thisPremoveChanges: Change[] = [];
	boardchanges.queueMovePiece(thisPremoveChanges, true, piece, coords);//[1,4]);
	premoves.push(thisPremoveChanges);
	//premoves.push(premove);
	console.log(premoves);
}

/** Clears all pending premoves */
function clearPremoves() {
	console.log("Clearing premoves");
	premoves = [];
}

function rewindPremoves(gamefile: FullGame) {
	console.log("Applying premoves");
	// Reverse the original array so all changes are made in the reverse order they were added
	premoves.slice().reverse().forEach(premoveChanges => {
		boardchanges.runChanges(gamefile, premoveChanges, boardchanges.changeFuncs, false); // Logical changes.  false for BACKWARDS
	});
}

function applyPremoves(gamefile: FullGame) {
	console.log("Rewinding premoves");
	premoves.forEach((premoveChanges : Change[]) => {
		boardchanges.runChanges(gamefile, premoveChanges, boardchanges.changeFuncs, true); // Logical changes
	});
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

	const premove : Change[] | undefined = premoves[0];
	if (!premove) {
		return;
	}
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) {
		return;
	}

	rewindPremoves(gamefile);

	boardchanges.runChanges(gamefile, premove, boardchanges.changeFuncs, true);

	// Check if the move was legal by comparing board state or using your own legality check
	// (You may want to add a more robust legality check here if needed)
	const moveIsLegal = true; // Assume true if runChanges did not throw or error

	if (moveIsLegal) {
		// Apply the premove to the real game state
		boardchanges.runChanges(gamefile, premove, boardchanges.changeFuncs, true);
		premoves.shift();
		
    	movesendreceive.sendMove();
	} else {
		rewindPremoves(gamefile);
		rewindPremovesVisuals();
		clearPremoves();
	}

	applyPremoves(gamefile);
}

function applyPremovesVisuals() {
	console.log("Applying premove visuals");
	const gamefile = gameslot.getGamefile();
	if (!gamefile || !premoves || premoves.length === 0) return;
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) {
		return;
	}

	premoves.forEach((premoveChanges : Change[]) => {
		//boardchanges.runChanges(gamefile, premoveChanges, boardchanges.changeFuncs, true); // Logical changes
		boardchanges.runChanges(mesh, premoveChanges, meshChanges, true); // Graphical changes
	});
}

function rewindPremovesVisuals() {
	console.log("Rewinding premove visuals");
	// TODO: Remove premove highlights/arrows/pieces
	
	const mesh : Mesh | undefined = gameslot.getMesh();
	if (!mesh) { return; }

	premoves.slice().reverse().forEach(premoveChanges => {
		boardchanges.runChanges(mesh, premoveChanges, meshChanges, false); // Graphical changes
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