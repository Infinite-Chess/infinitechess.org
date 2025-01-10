
// Import Start
import legalmoves from './legalmoves.js';
import gamefileutility from '../util/gamefileutility.js';
import specialdetect from './specialdetect.js';
import boardchanges from './boardchanges.js';
import state from './state.js';
import math from '../../util/math.js';
import moveutil from '../util/moveutil.js';
import checkdetection from './checkdetection.js';
import formatconverter from './formatconverter.js';
import colorutil from '../util/colorutil.js';
import coordutil from '../util/coordutil.js';
import wincondition from './wincondition.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('../util/moveutil.js').Move} Move
*/

"use strict";

// Custom type definitions...


/** Here lies the universal methods for moving pieces, forward or rewinding. */

/**
 * Generates all move data needed before move execution
 * @param {gamefile} gamefile 
 * @param {Move} move 
 */
function generateMove(gamefile, move) {
	move.changes = [];
	move.generateIndex = gamefile.moveIndex + 1;
	state.initMoveStates(move);

	const piece = gamefileutility.getPieceAtCoords(gamefile, move.startCoords);
	if (!piece) throw new Error(`Cannot make move because no piece exists at coords ${move.startCoords}.`);
	move.type = piece.type;
	const trimmedType = colorutil.trimColorExtensionFromType(move.type); // "queens"

	// Do this before making the move, so that if its a pawn double push, enpassant can be reinstated and not deleted.
	deleteEnpassantAndSpecialRightsProperties(gamefile, move);
    
	let specialMoveMade;
	if (gamefile.specialMoves[trimmedType]) specialMoveMade = gamefile.specialMoves[trimmedType](gamefile, piece, move);
	if (!specialMoveMade) movePiece_NoSpecial(gamefile, piece, move); // Move piece regularly (no special tag)

	incrementMoveRule(gamefile, move, boardchanges.wasACapture(move));
}

/**
 * Applies a moves changes to the gamefile
 * Does not apply any graphical effects
 * @param {*} gamefile 
 * @param {*} move 
 * @param {*} forward 
 */
function applyMove(gamefile, move, forward = true, {global = false} = {}) {
	// Stops stupid missing piece errors
	if (gamefile.moveIndex + !forward !== move.generateIndex) return new Error(`Move was expected at index ${move.generateIndex} but applied at ${gamefile.moveIndex + !forward} (forward: ${forward})!`);
	
	boardchanges.runMove(gamefile, move, boardchanges.changeFuncs, forward);
	state.applyMove(gamefile, move, forward, {globalChange: global});
}

/**
 * **Universal** function for executing forward (not rewinding) moves.
 * Called when we move the selected piece, receive our opponent's move,
 * or need to simulate a move within the checkmate algorithm.
 * @param {gamefile} gamefile 
 * @param {Move} move 
 */
function makeMove(gamefile, move) {
	gamefile.moveIndex++;
	gamefile.moves.push(move);

	updateTurn(gamefile);

	applyMove(gamefile, move, true, { global: true });

	// The "check" property will be added inside updateInCheck()...
	// The "mate" property will be added inside our game conclusion checks...

	// ALWAYS DO THIS NOW, no matter what.
	createCheckState(gamefile, move);
	if (gamefile.inCheck) move.check = true;
}

/**
 * Deletes the gamefile's enpassant property, and the moving piece's special right.
 * This needs to be done every time we make a move.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move
 */
function deleteEnpassantAndSpecialRightsProperties(gamefile, move) {
	state.queueState(move, "enpassant", gamefile.enpassant, undefined);
	let key = coordutil.getKeyFromCoords(move.startCoords);
	state.queueState(move, `specialRights`, gamefile.specialRights[key], undefined, { coords: key });
	key = coordutil.getKeyFromCoords(move.endCoords);
	state.queueState(move, `specialRights`, gamefile.specialRights[key], undefined, { coords: key }); // We also delete the captured pieces specialRights for ANY move.
}

/**
 * Standardly moves a piece. Deletes any captured piece. Animates if specified.
 * If the move is a special move, a separate method is needed.
 * @param {gamefile} gamefile - The gamefile
 * @param {Piece} piece - The piece to move
 * @param {Move} move - The move that's being made
*/
function movePiece_NoSpecial(gamefile, piece, move) {

	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);

	if (capturedPiece) {
		boardchanges.queueCapture(move.changes, piece, move.endCoords, capturedPiece);
		return;
	};

	boardchanges.queueMovePiece(move.changes, piece, move.endCoords);

}


/**
 * Increments the gamefile's moveRuleStatus property, if the move-rule is in use.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move - The move
 * @param {boolean} wasACapture Whether the move made a capture
 */
function incrementMoveRule(gamefile, move, wasACapture) {
	if (!gamefile.gameRules.moveRule) return; // Not using the move-rule
    
	// Reset if it was a capture or pawn movement
	const newMoveRule = (wasACapture || move.type.startsWith('pawns')) ? 0 : gamefile.moveRuleState + 1;
	state.queueState(move, 'moverulestate', gamefile.moveRuleState, newMoveRule, {global: true});
}

/**
 * Flips the `whosTurn` property of the gamefile.
 * @param {gamefile} gamefile - The gamefile
 */
function updateTurn(gamefile) {
	gamefile.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
}

function createCheckState(gamefile, move) {
	let attackers = undefined;
	// Only pass in attackers array to be filled by the checking pieces if we're using checkmate win condition.
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = colorutil.getOppositeColor(whosTurnItWasAtMoveIndex);
	if (gamefile.gameRules.winConditions[oppositeColor].includes('checkmate')) attackers = [];

	state.setState(
		gamefile,
		move,
		"check",
		gamefile.inCheck,
		checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, attackers)
	); // Passes in the gamefile as an argument
	state.setState(gamefile, move, "attackers", gamefile.attackers, attackers || []); // Erase the checking pieces calculated from previous turn and pass in new on
}

/**
 * Updates the `inCheck` and `attackers` properties of the gamefile after making a move or rewinding.
* Needs to be called AFTER flipping the `whosTurn` property.
* @param {gamefile} gamefile - The gamefile
*/
function updateInCheck(gamefile) {
	let attackers = undefined;
	// Only pass in attackers array to be filled by the checking pieces if we're using checkmate win condition.
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = colorutil.getOppositeColor(whosTurnItWasAtMoveIndex);
	if (gamefile.gameRules.winConditions[oppositeColor].includes('checkmate')) attackers = [];

	gamefile.inCheck = checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, attackers); // Passes in the gamefile as an argument
	gamefile.attackers = attackers || []; // Erase the checking pieces calculated from previous turn and pass in new ones!
}

/**
 * Accepts a move list in the most comapact form: `['1,2>3,4','10,7>10,8Q']`,
 * reconstructs each move's properties, INCLUDING special flags, and makes that move
 * in the game. At each step it has to calculate what legal special
 * moves are possible, so it can pass on those flags.
 * On the very final move it test if the game is over, and animate the move.
 * 
 * **THROWS AN ERROR** if any move during the process is in an invalid format.
 * @param {gamefile} gamefile - The gamefile
 * @param {string[]} moves - The list of moves to add to the game, each in the most compact format: `['1,2>3,4','10,7>10,8Q']`
 */
function makeAllMovesInGame(gamefile, moves) {
	if (gamefile.moveIndex !== -1) throw new Error("Cannot make all moves in game when we're not at the beginning.");
    
	gamefile.moves = [];

	for (let i = 0; i < moves.length; i++) {

		const shortmove = moves[i];
		const move = calculateMoveFromShortmove(gamefile, shortmove);
		// The makeMove() method auto-reconstructs the `captured` property.

		if (!move) throw new Error(`Cannot make all moves in game! There was a move in an invalid format: ${shortmove}. Index: ${i}`);

		// Make the move in the game!

		makeMove(gamefile, move);
	}
}

/**
 * Accepts a move in the most compact short form, and constructs the Move object
 * and most of its properties, EXCLUDING `type` and `captured` which are reconstructed by makeMove().
 * Has to calculate the piece's legal special moves to do add special move flags.
 * 
 * **Returns undefined** if there was an error anywhere in the conversion.
 * This does NOT perform legality checks, so still do that afterward.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} shortmove - The move in most compact form: `1,2>3,4Q`
 * @returns {Move | undefined} The move object, or undefined if there was an error.
 */
function calculateMoveFromShortmove(gamefile, shortmove) {
	if (!moveutil.areWeViewingLatestMove(gamefile)) return console.error("Cannot calculate Move object from shortmove when we're not viewing the most recently played move.");

	// Reconstruct the startCoords, endCoords, and promotion properties of the longmove

	/** @type {Move} */
	let move;
	try {
		move = formatconverter.ShortToLong_CompactMove(shortmove); // { startCoords, endCoords, promotion }
	} catch (error) {
		console.error(error);
		console.error(`Failed to calculate Move from shortmove because it's in an incorrect format: ${shortmove}`);
		return;
	}

	// Reconstruct the enpassant and castle properties by calculating what legal
	// special moves this piece can make, comparing them to the move's endCoords,
	// and if there's a match, pass on the special move flag.

	const selectedPiece = gamefileutility.getPieceAtCoords(gamefile, move.startCoords);
	if (!selectedPiece) return move; // Return without any special move properties, this will automatically be an illegal move.

	const legalSpecialMoves = legalmoves.calculate(gamefile, selectedPiece, { onlyCalcSpecials: true }).individual;
	for (let i = 0; i < legalSpecialMoves.length; i++) {
		const thisCoord = legalSpecialMoves[i];
		if (!coordutil.areCoordsEqual(thisCoord, move.endCoords)) continue;
		// Matched coordinates! Transfer any special move tags
		specialdetect.transferSpecialFlags_FromCoordsToMove(thisCoord, move);
		break;
	}

	generateMove(gamefile, move);

	return move;
}

/**
 * Iterates from moveIndex to the target index
 * Callbacks should not update the board
 * @param {gamefile} gamefile 
 * @param {number} targetIndex 
 * @param {CallableFunction} callback 
 */
function forEachMove(gamefile, targetIndex, callback) {
	if (targetIndex === gamefile.moveIndex) return;

	const forwards = targetIndex >= gamefile.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = gamefile.moveIndex;
	
	if (gamefile.moves.length <= targetIndex + offset || targetIndex + offset < 0) throw new Error("Target index is outside of the movelist!");

	while (i !== targetIndex) {
		i = math.moveTowards(i, targetIndex, 1);
		const move = gamefile.moves[i + offset];

		if (move === undefined) {
			console.log(`Undefined! ${i}, ${targetIndex}`);
			continue;
		}

		callback(move);
	}
}

/**
 * Iterates to a certain move index.
 * Callable should be a move application function
 * @param {gamefile} gamefile 
 * @param {number} index 
 * @param {CallableFunction} callback 
 */
function gotoMove(gamefile, index, callback) {
	if (index === gamefile.moveIndex) return;

	const forwards = index >= gamefile.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = gamefile.moveIndex;
	
	if (gamefile.moves.length <= index + offset || index + offset < 0) throw new Error("Target index is outside of the movelist!");

	while (i !== index) {
		i = math.moveTowards(i, index, 1);
		const move = gamefile.moves[i + offset];

		if (move === undefined) {
			console.log(`Undefined! ${i}, ${index}`);
			continue;
		}
		gamefile.moveIndex = i;
		callback(move);
	}

}

/**
 * **Universal** function for undo'ing or rewinding moves.
 * Called when we're rewinding the game to view past moves,
 * or when the checkmate algorithm is undo'ing a move.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} options - An object containing various options (ALL of these are default *true*, EXCEPT `simulated` which is default *false*):
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves.
 * - `removeMove`: Whether to delete the move from the gamefile's move list. Should be true if we're undo'ing simulated moves.
 * - `animate`: Whether to animate this rewinding.
 */
function rewindMove(gamefile) {

	const move = moveutil.getMoveFromIndex(gamefile.moves, gamefile.moveIndex); // { type, startCoords, endCoords, captured }

	gamefile.moveIndex--;
	applyMove(gamefile, move, false, { global: true });

	// Finally, delete the move off the top of our moves [] array list
	moveutil.deleteLastMove(gamefile.moves);
	updateTurn(gamefile);
}

/**
 * Wraps a function in a simulated move
 * @param {gamefile} gamefile 
 * @param {Move} move 
 * @param {CallableFunction} callback
 * @returns whatever is returned by the callback
 */
function simulateMoveWrapper(gamefile, move, callback) {
	// Moves the piece without unselecting it or regenerating the pieces model.
	generateMove(gamefile, move);
	makeMove(gamefile, move);

	// What info can we pull from the game after simulating this move?
	const info = callback();

	// Undo the move, REWIND.
	// We don't have to worry about the index changing, it is the same.
	// BUT THE CAPTURED PIECE MUST be inserted in the exact location!
	// Only remove the move
	rewindMove(gamefile, true);

	return info;
}

/**
 * Simulates a move to get the check
 * @param {gamefile} gamefile 
 * @param {Move} move 
 * @param {*} colorToTestInCheck 
 * @returns 
 */
function getSimulatedCheck(gamefile, move, colorToTestInCheck) {
	return simulateMoveWrapper(
		gamefile,
		move,
		() => checkdetection.detectCheck(gamefile, colorToTestInCheck, []),
	);	
}

/**
 * Simulates a move to get the gameConclusion
 * @param {gamefile} gamefile 
 * @param {Move} move 
 * @returns the gameConclusion
 */
function getSimulatedConclusion(gamefile, move) {
	return simulateMoveWrapper(
		gamefile,
		move,
		() => wincondition.getGameConclusion(gamefile)
	);
}

export default {
	updateInCheck,
	generateMove,
	makeMove,
	updateTurn,
	forEachMove,
	gotoMove,
	makeAllMovesInGame,
	calculateMoveFromShortmove,
	applyMove,
	rewindMove,
	simulateMoveWrapper,
	getSimulatedCheck,
	getSimulatedConclusion,
};