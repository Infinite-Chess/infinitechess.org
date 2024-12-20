
// Import Start
import legalmoves from './legalmoves.js';
import gamefileutility from '../util/gamefileutility.js';
import specialdetect from './specialdetect.js';
import boardchanges from './boardchanges.js';
import clock from './clock.js';
import math from '../../util/math.js';
import moveutil from '../util/moveutil.js';
import checkdetection from './checkdetection.js';
import formatconverter from './formatconverter.js';
import colorutil from '../util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('../util/moveutil.js').Move} Move
*/

"use strict";

// Custom type definitions...



/** Here lies the universal methods for moving pieces, forward or rewinding. */

function generateMove(gamefile, move) {
	move.changes = [];

	const piece = gamefileutility.getPieceAtCoords(gamefile, move.startCoords);
	if (!piece) throw new Error(`Cannot make move because no piece exists at coords ${move.startCoords}.`);
	move.type = piece.type;
	const trimmedType = colorutil.trimColorExtensionFromType(move.type); // "queens"
    
	storeRewindInfoOnMove(gamefile, move, piece.index); // Keep track if important stuff to remember, for rewinding the game if we undo moves

	// Do this before making the move, so that if its a pawn double push, enpassant can be reinstated and not deleted.
	deleteEnpassantAndSpecialRightsProperties(gamefile, move);
    
	let specialMoveMade;
	if (gamefile.specialMoves[trimmedType]) specialMoveMade = gamefile.specialMoves[trimmedType](gamefile, piece, move);
	if (!specialMoveMade) movePiece_NoSpecial(gamefile, piece, move); // Move piece regularly (no special tag)
}

function makeMove(gamefile, move, { updateProperties, recordCheck }) {
	const wasACapture = move.captured != null;

	boardchanges.applyChanges(gamefile, move.changes);

	gamefile.moveIndex++;
	gamefile.moves.push(move);

	// The "check" property will be added inside updateInCheck()...
	// The "mate" property will be added inside our game conclusion checks...

	if (updateProperties) incrementMoveRule(gamefile, move.type, wasACapture);

	// ALWAYS DO THIS NOW, no matter what. 
	updateInCheck(gamefile, recordCheck);
}

/**
 * Stores crucial game information for rewinding this move on the move object.
 * Upon rewinding, this information will be deleted.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move - The move
 * @param {Object} options - An object that may contain the following options:
 * - `simulated`: Whether you plan on undo'ing this move. If *true*, then `capturedIndex` and `pawnIndex` will also be remembered, so the mesh doesn't get screwed up when rewinding. Default: *false*
 */
function storeRewindInfoOnMove(gamefile, move, pieceIndex, { simulated = false } = {}) {
	const rewindInfoAlreadyPresent = move.rewindInfo != null;
	const rewindInfo = move.rewindInfo || {};

	if (simulated && move.promotion) rewindInfo.pawnIndex = pieceIndex; // `capturedIndex` is saved elsewhere within movePiece_NoSpecial()
	if (!rewindInfoAlreadyPresent) {
		rewindInfo.inCheck = jsutil.deepCopyObject(gamefile.inCheck);
		rewindInfo.gameConclusion = gamefile.gameConclusion;
		if (gamefile.attackers) rewindInfo.attackers = jsutil.deepCopyObject(gamefile.attackers);
		if (gamefile.moveRuleState !== undefined) rewindInfo.moveRuleState = gamefile.moveRuleState;
		if (gamefile.checksGiven) rewindInfo.checksGiven = gamefile.checksGiven;
	}

	move.rewindInfo = rewindInfo;
}

/**
 * Deletes the gamefile's enpassant property, and the moving piece's special right.
 * This needs to be done every time we make a move.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move
 */
function deleteEnpassantAndSpecialRightsProperties(gamefile, move) {
	boardchanges.queueSetEnPassant(move.changes, gamefile.enpassant, undefined);
	let key = coordutil.getKeyFromCoords(move.startCoords);
	boardchanges.queueDeleteSpecialRights(move.changes, key, gamefile.specialRights[key]);
	key = coordutil.getKeyFromCoords(move.endCoords);
	boardchanges.queueDeleteSpecialRights(move.changes, key, gamefile.specialRights[key]); // We also delete the captured pieces specialRights for ANY move.
}

// RETURNS index of captured piece! Required for undo'ing moves.

/**
 * Standardly moves a piece. Deletes any captured piece. Animates if specified.
 * If the move is a special move, a separate method is needed.
 * @param {gamefile} gamefile - The gamefile
 * @param {Piece} piece - The piece to move
 * @param {Move} move - The move that's being made
 * @param {Object} options - An object containing various options (ALL of these are default *true*):
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves, or if you're planning on regenerating the mesh after this.
 * - `animate`: Whether to animate this move.
 * - `simulated`: Whether you plan on undo'ing this move. If true, the index of the captured piece within the gamefile's piece list will be stored in the `rewindInfo` property of the move for easy undo'ing without screwing up the mesh.
 */
function movePiece_NoSpecial(gamefile, piece, move) { // piece: { coords, type, index }

	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);

	if (capturedPiece) {
		boardchanges.queueCaputure(move.changes, piece, move.endCoords, capturedPiece);
		return;
	};

	boardchanges.queueMovePiece(move.changes, piece, move.endCoords);

}


/**
 * Increments the gamefile's moveRuleStatus property, if the move-rule is in use.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} typeMoved - The type of piece moved
 * @param {boolean} wasACapture Whether the move made a capture
 */
function incrementMoveRule(gamefile, typeMoved, wasACapture) {
	if (!gamefile.gameRules.moveRule) return; // Not using the move-rule
    
	// Reset if it was a capture or pawn movement
	if (wasACapture || typeMoved.startsWith('pawns')) gamefile.moveRuleState = 0;
	else gamefile.moveRuleState++;
}

/**
 * Flips the `whosTurn` property of the gamefile, updates
 * the text on-screen, then pushes the clock.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} options - An object that may contain the options (all are default *true*):
 * - `pushClock`: Whether to push the clock.
 */
function updateTurnData(gamefile, { pushClock = true } = {}) {
	gamefile.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	if (pushClock) {
		clock.push(gamefile);
	};
}

/**
 * Updates the `inCheck` and `attackers` properties of the gamefile after making a move or rewinding.

    * Needs to be called AFTER flipping the `whosTurn` property.
    * @param {gamefile} gamefile - The gamefile
    * @param {boolean} [flagMoveAsCheck] - If *true*, flags the last played move as a check. Default: true
    */
function updateInCheck(gamefile, flagMoveAsCheck = true) {

	let attackers = undefined;
	// Only pass in attackers array to be filled by the checking pieces if we're using checkmate win condition.
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = colorutil.getOppositeColor(whosTurnItWasAtMoveIndex);
	if (gamefile.gameRules.winConditions[oppositeColor].includes('checkmate')) attackers = [];

	gamefile.inCheck = checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, attackers); // Passes in the gamefile as an argument
	gamefile.attackers = attackers || []; // Erase the checking pieces calculated from previous turn and pass in new ones!

	if (gamefile.inCheck && flagMoveAsCheck) moveutil.flagLastMoveAsCheck(gamefile);
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
        
	for (let i = 0; i < moves.length; i++) {

		const shortmove = moves[i];
		const move = calculateMoveFromShortmove(gamefile, shortmove);
		// The makeMove() method auto-reconstructs the `captured` property.

		if (!move) throw new Error(`Cannot make all moves in game! There was a move in an invalid format: ${shortmove}. Index: ${i}`);

		// Make the move in the game!

		// const isLastMove = i === moves.length - 1;
		// const animate = isLastMove;
		makeMove(gamefile, move, { pushClock: false, updateData: false, concludeGameIfOver: false, doGameOverChecks: false, animate: false });
	}

	if (moves.length === 0) updateInCheck(gamefile, false);
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

	generateMove(gamefile, move)

	return move;
}

/**
 * 
 * @param {gamefile} gamefile
 * @param {number} targetIndex 
 */
function forEachMove(gamefile, targetIndex, callback) {
	if (gamefile.moves.length >= targetIndex) return console.error("Cannot!"); //TODO: make this error useful

	let i = gamefile.moveIndex;

	while (true) {
		i = math.moveTowards(i, targetIndex, 1)
		const move = gamefile.moves[i]

		callback(move)

		if (i === moveIndex) break;
	}

}

/**
 * Fast-forwards the game to front, to the most-recently played move.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} options - An object containing various options (ALL of these are default *true*):
 * - `flipTurn`: Whether each forwarded move should flip whosTurn. This should be false when forwarding to the game's front after rewinding.
 * - `animateLastMove`: Whether to animate the last move, or most-recently played.
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false if we plan on regenerating the model manually after forwarding.
 * - `updateProperties`: Whether each move should update gamefile properties that game-over algorithms rely on, such as the 50-move-rule's status, or 3-Check's check counter.
 * - `simulated`: Whether you plan on undo'ing this forward, rewinding back to where you were. If true, the `rewindInfo` property will be added to each forwarded move in the gamefile for easy reverting when it comes time.
 */

function forwardToFront(gamefile, { flipTurn = true, animateLastMove = true, updateData = true, updateProperties = true, simulated = false } = {}) {
	if (updateData && gamefile.mesh.locked > 0) { // The mesh is locked (we cannot forward moves right now)
		// Call this function again with the same arguments as soon as the mesh is unlocked
		gamefile.mesh.callbacksOnUnlock.push(gamefile => forwardToFront(gamefile, { flipTurn, animateLastMove, updateData, updateProperties, simulated }));
		return;
	}

}

/**
 * Rewinds the game until we reach the desired move index.
 * @param {gamefile} gamefile - The gamefile
 * @param {number} moveIndex - The desired move index
 * @param {Object} options - An object containing various options (ALL of these are default *true*, EXCEPT `simulated` which is default *false*):
 * - `removeMove`: Whether to delete the moves in the gamefile's moves list while rewinding.
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves, or if you're planning on regenerating the mesh after this.
 */
function rewindGameToIndex(gamefile, moveIndex, { removeMove = true } = {}) {
	if (removeMove && !moveutil.areWeViewingLatestMove(gamefile)) return console.error("Cannot rewind game to index while deleting moves unless we start at the most recent move. forwardToFront() first.");
	if (gamefile.moveIndex < moveIndex) return console.error("Cannot rewind game to index when we need to forward instead.");
	while (gamefile.moveIndex > moveIndex) rewindMove(gamefile, removeMove);
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
function rewindMove(gamefile, { removeMove = true } = {} ) {

	const move = moveutil.getMoveFromIndex(gamefile.moves, gamefile.moveIndex); // { type, startCoords, endCoords, captured }

	boardchanges.undoChanges(gamefile, move.changes);

	// inCheck and attackers are always restored, no matter if we're deleting the move or not.
	gamefile.inCheck = move.rewindInfo.inCheck;
	if (move.rewindInfo.attackers) gamefile.attackers = move.rewindInfo.attackers;
	if (removeMove) { // Restore original values
		gamefile.moveRuleState = move.rewindInfo.moveRuleState;
		gamefile.checksGiven = move.rewindInfo.checksGiven;
		gamefile.gameConclusion = move.rewindInfo.gameConclusion; // Simulated moves may or may not have performed game over checks.
	}

	// Finally, delete the move off the top of our moves [] array list
	if (removeMove) moveutil.deleteLastMove(gamefile.moves);
	gamefile.moveIndex--;
}

/**
 * Simulates the provided move, testing if it's in check and, if specified, also the game conclusion,
 * then undo's the move, restoring it to how the gamefile was before.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} The move to simulate.
 * @param {string} colorToTestInCheck - The side to test if they are in check. Usually this is the color of the side making the move, because we don't want to step into check.
 * @param {Object} options - An object that may contain the properties:
 * - `doGameOverChecks`: Whether, while simulating this move, to perform game over checks such as checkmate or other win conditions. SLOWER, but this can be used to verify the game conclusion the opponent claimed. Default: *false*
 * @returns {Object} An object that may contains the properties:
 * - `isCheck`: Whether making this move puts the specified color in check. Usually it's you stepping into check.
 * - `gameConclusion`: The resulting `gameConclusion` after the move, if `doGameOverChecks` was specified as *true*.
 */
function simulateMove(gamefile, move, colorToTestInCheck, { doGameOverChecks = false } = {}) {
	// Moves the piece without unselecting it or regenerating the pieces model.
	generateMove(gamefile, move);
	makeMove(gamefile, move, {recordCheck: true, updateProperties: doGameOverChecks});

	// What info can we pull from the game after simulating this move?
	const info = {
		isCheck: doGameOverChecks ? gamefile.inCheck : checkdetection.detectCheck(gamefile, colorToTestInCheck, []),
		gameConclusion: doGameOverChecks ? wincondition.getGameConclusion(gamefile) : undefined
	};

	// Undo the move, REWIND.
	// We don't have to worry about the index changing, it is the same.
	// BUT THE CAPTURED PIECE MUST be inserted in the exact location!
	// Only remove the move
	rewindMove(gamefile, true);

	return info; // Info from simulating the move: { isCheck, gameConclusion }
}

/**
 * Strips the coordinates of their special move properties.
 * For example, unstripped coords may look like: `[2,7,enpassant:true]`
 * @param {number[]} coords - The coordinates
 * @returns {number[]} The stripped coordinates: `[2,7]`
 */
function stripSpecialMoveTagsFromCoords(coords) { return [coords[0], coords[1]]; }

export default {
	makeMove,
	nextTurn,
	makeAllMovesInGame,
	calculateMoveFromShortmove,
	forwardToFront,
	rewindGameToIndex,
	rewindMove,
	simulateMove,
	stripSpecialMoveTagsFromCoords
};