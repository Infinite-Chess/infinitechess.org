
// Import Start
import legalmoves from './legalmoves.js';
import gamefileutility from '../util/gamefileutility.js';
import specialdetect from './specialdetect.js';
import arrows from '../../game/rendering/arrows.js';
import clock from './clock.js';
import guiclock from '../../game/gui/guiclock.js';
import organizedlines from './organizedlines.js';
import animation from '../../game/rendering/animation.js';
import guinavigation from '../../game/gui/guinavigation.js';
import piecesmodel from '../../game/rendering/piecesmodel.js';
import guigameinfo from '../../game/gui/guigameinfo.js';
import moveutil from '../util/moveutil.js';
import checkdetection from './checkdetection.js';
import formatconverter from './formatconverter.js';
import colorutil from '../util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
import frametracker from '../../game/rendering/frametracker.js';
import stats from '../../game/gui/stats.js';
import gameslot from '../../game/chess/gameslot.js';
import gameloader from '../../game/chess/gameloader.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('../util/moveutil.js').Move} Move
 * @typedef {import('../util/coordutil.js').Coords} Coords
*/

"use strict";

// Custom type definitions...

/**
 * TODO: Move this type definition to a new pieceutil TYPESCRIPT,
 * and make the coordinates only length-2.
 * 
 * The Piece Object.
 * @typedef {Object} Piece
 * @property {string} type - The type of the piece (e.g. `queensW`).
 * @property {Coords} coords - The coordinates of the piece: `[x,y]`
 * @property {number} index - The index of the piece within the gamefile's piece list.
 */

/** Here lies the universal methods for moving pieces, forward or rewinding. */

/**
 * **Universal** function for executing forward (not rewinding) moves.
 * Called when we move the selected piece, receive our opponent's move,
 * or need to simulate a move within the checkmate algorithm.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move - The move to make, with the properties `startCoords`, `endCoords`, and any special move flags, all other properties of the move will be added within. CRUCIAL: If `simulated` is true and `recordMove` is false, the move passed in MUST be one of the moves in the gamefile's move list! Otherwise we'll have trouble undo'ing the simulated move without messing up the mesh.
 * @param {Object} options - An object containing various options (ALL of these are default *true*, EXCEPT `simulated` which is default *false*):
 * - `flipTurn`: Whether to flip the `whosTurn` property of the gamefile. Most of the time this will be true, except when hitting the rewind/forward buttons.
 * - `recordMove`: Whether to record the move in the gamefile's move list. Should be false when rewinding/fast-forwarding the game.
 * - `pushClock`: Whether to push the clock. If we're in an online game we NEVER push the clock anyway, only the server does.
 * - `doGameOverChecks`: Whether to perform game-over checks, such as checkmate or other win conditions.
 * - `concludeGameIfOver`: If true, and `doGameOverChecks` is true, then if this move ends the game, we will not stop the clocks, darken the board, display who won, or play a sound effect.
 * - `animate`: Whether to animate this move.
 * - `animateSecondary`: Animate the pieces affected by the move without the piece that made the move. Used after dragging the king to castle. Is only used when `animate` is false.
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves, or if you're planning on regenerating the mesh after this.
 * - `updateProperties`: Whether to update gamefile properties that game-over algorithms rely on, such as the 50-move-rule's status, or 3-Check's check counter.
 * - `simulated`: Whether you plan on undo'ing this move. If true, the `rewindInfo` property will be added to the `move` for easy restoring of the gamefile's properties when undo'ing the move.
 */
function makeMove(gamefile, move, { flipTurn = true, recordMove = true, pushClock = true, doGameOverChecks = true, concludeGameIfOver = true, animate = true, animateSecondary = false, updateData = true, updateProperties = true, simulated = false } = {}) {                
	const piece = gamefileutility.getPieceAtCoords(gamefile, move.startCoords);
	if (!piece) throw new Error(`Cannot make move because no piece exists at coords ${move.startCoords}.`);
	move.type = piece.type;
	const trimmedType = colorutil.trimColorExtensionFromType(move.type); // "queens"
    
	storeRewindInfoOnMove(gamefile, move, piece.index, { simulated }); // Keep track if important stuff to remember, for rewinding the game if we undo moves

	// Do this before making the move, so that if its a pawn double push, enpassant can be reinstated and not deleted.
	if (recordMove || updateProperties) deleteEnpassantAndSpecialRightsProperties(gamefile, move.startCoords, move.endCoords);
    
	let specialMoveMade;
	if (gamefile.specialMoves[trimmedType]) specialMoveMade = gamefile.specialMoves[trimmedType](gamefile, piece, move, { updateData, animate, animateSecondary, updateProperties, simulated });
	if (!specialMoveMade) movePiece_NoSpecial(gamefile, piece, move, { updateData, recordMove, animate, simulated }); // Move piece regularly (no special tag)
	const wasACapture = move.captured !== undefined;

	gamefile.moveIndex++;
	if (recordMove) gamefile.moves.push(move);
	// The "check" property will be added inside updateInCheck()...
	// The "mate" property will be added inside our game conclusion checks...

	if (updateProperties) incrementMoveRule(gamefile, piece.type, wasACapture);

	if (flipTurn) flipWhosTurn(gamefile, { pushClock, doGameOverChecks });

	// ALWAYS DO THIS NOW, no matter what. 
	updateInCheck(gamefile, recordMove);
	if (doGameOverChecks) {
		gamefileutility.doGameOverChecks(gamefile);
		if (!simulated && concludeGameIfOver && gamefile.gameConclusion && !gameloader.areInOnlineGame()) gameslot.concludeGame();
	}

	if (updateData) {
		guinavigation.update_MoveButtons();
		stats.setTextContentOfMoves(); // Making a move should change the move number in the stats
		frametracker.onVisualChange();
	}

	if (!simulated) arrows.clearListOfHoveredPieces();
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
	const rewindInfoAlreadyPresent = move.rewindInfo !== undefined;
	const rewindInfo = move.rewindInfo || {};

	if (simulated && move.promotion) rewindInfo.pawnIndex = pieceIndex; // `capturedIndex` is saved elsewhere within movePiece_NoSpecial()
	if (!rewindInfoAlreadyPresent) {
		rewindInfo.inCheck = jsutil.deepCopyObject(gamefile.inCheck);
		rewindInfo.gameConclusion = gamefile.gameConclusion;
		if (gamefile.attackers) rewindInfo.attackers = jsutil.deepCopyObject(gamefile.attackers);
		if (gamefile.enpassant) rewindInfo.enpassant = gamefile.enpassant;
		if (gamefile.moveRuleState !== undefined) rewindInfo.moveRuleState = gamefile.moveRuleState;
		if (gamefile.checksGiven) rewindInfo.checksGiven = gamefile.checksGiven;
		let key = coordutil.getKeyFromCoords(move.startCoords);
		if (gamefile.specialRights[key]) rewindInfo.specialRightStart = true;
		key = coordutil.getKeyFromCoords(move.endCoords);
		if (gamefile.specialRights[key]) rewindInfo.specialRightEnd = true;
	}

	move.rewindInfo = rewindInfo;
}

/**
 * Deletes the gamefile's enpassant property, and the moving piece's special right.
 * This needs to be done every time we make a move.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} startCoords - The coordinates of the piece moving
 * @param {number[]} endCoords - The destination of the piece moving
 */
function deleteEnpassantAndSpecialRightsProperties(gamefile, startCoords, endCoords) {
	delete gamefile.enpassant;
	let key = coordutil.getKeyFromCoords(startCoords);
	delete gamefile.specialRights[key]; // We also delete its special move right for ANY piece moved
	key = coordutil.getKeyFromCoords(endCoords);
	delete gamefile.specialRights[key]; // We also delete the captured pieces specialRights for ANY move.
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
function movePiece_NoSpecial(gamefile, piece, move, { updateData = true, animate = true, simulated = false } = {}) { // piece: { coords, type, index }
	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);
	if (capturedPiece) move.captured = capturedPiece.type;
	if (capturedPiece && simulated) move.rewindInfo.capturedIndex = capturedPiece.index;

	if (capturedPiece) deletePiece(gamefile, capturedPiece, { updateData });

	movePiece(gamefile, piece, move.endCoords, { updateData });

	if (animate) animation.animatePiece(piece.type, move.startCoords, move.endCoords, capturedPiece);
}

/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * @param {gamefile} gamefile - The gamefile
 * @param {Piece} piece - The piece being moved
 * @param {number[]} endCoords - The destination coordinates
 * @param {Object} options - An object that may contain the property `updateData`, that when true will update the piece in the mesh.
 */
function movePiece(gamefile, piece, endCoords, { updateData = true } = {}) {
	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = endCoords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);

	// Add the piece to organized lists with new destination
	organizedlines.organizePiece(piece.type, endCoords, gamefile);

	// Edit its data within the mesh of the pieces!
	if (updateData) piecesmodel.movebufferdata(gamefile, piece, endCoords);
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists, and updates its mesh data.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} type - The type of piece to place
 * @param {number[]} coords - The coordinates
 * @param {number} [desiredIndex] - Optional. If specified, this will place the piece at that index within the gamefile's piece list. This is crucial for undo'ing simulated moves so as to not screw up the mesh.
 * @param {Object} options - An object that may contain the property `updateData`, that when true will update the piece in the mesh.
 */
function addPiece(gamefile, type, coords, desiredIndex, { updateData = true } = {}) { // desiredIndex optional

	const list = gamefile.ourPieces[type];

	// If no index specified, make the default the first undefined in the list!
	if (desiredIndex === undefined) desiredIndex = list.undefineds[0];

	// If there are no undefined placeholders left, updateData better be false, because we are going to append on the end!
	if (desiredIndex === undefined && updateData) throw new Error("Cannot add a piece and update the data when there are no undefined placeholders remaining!");

	if (desiredIndex === undefined) list.push(coords);
	else { // desiredIndex specified

		const isPieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, coords) !== undefined;
		if (isPieceAtCoords) throw new Error("Can't add a piece on top of another piece!");

		// Remove the undefined from the undefineds list
		gamefile.ourPieces[type].undefineds = jsutil.deleteElementFromOrganizedArray(gamefile.ourPieces[type].undefineds, desiredIndex);

		list[desiredIndex] = coords;
	}

	organizedlines.organizePiece(type, coords, gamefile);

	if (!updateData) return;

	// Edit its data within the pieces buffer!
	const undefinedPiece = { type, index: desiredIndex };
	piecesmodel.overwritebufferdata(gamefile, undefinedPiece, coords, type);

	// Do we need to add more undefineds?
	// Only adding pieces can ever reduce the number of undefineds we have, so we do that here!
	if (organizedlines.areWeShortOnUndefineds(gamefile)) organizedlines.addMoreUndefineds(gamefile, { log: true });
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists, and deletes its mesh data (overwrites with zeros).
 * @param {gamefile} gamefile - The gamefile
 * @param {string} type - The type of piece to place
 * @param {number[]} coords - The coordinates
 * @param {number} [desiredIndex] - Optional. If specified, this will place the piece at that index within the gamefile's piece list. This is crucial for undo'ing simulated moves so as to not screw up the mesh.
 * @param {Object} options - An object that may contain the property `updateData`, that when true will update the piece in the mesh.
 */
function deletePiece(gamefile, piece, { updateData = true } = {}) { // piece: { type, index }

	const list = gamefile.ourPieces[piece.type];
	gamefileutility.deleteIndexFromPieceList(list, piece.index);

	// Remove captured piece from organized piece lists
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);

	// Delete its data within the pieces buffer! Overwrite with 0's
	if (updateData) piecesmodel.deletebufferdata(gamefile, piece);
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
 * - `doGameOverChecks`: Whether game-over checks such as checkmate, or other win conditions, are performed for this move.
 */
function flipWhosTurn(gamefile, { pushClock = true, doGameOverChecks = true } = {}) {
	gamefile.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	if (doGameOverChecks) guigameinfo.updateWhosTurn(gamefile);
	if (pushClock) {
		clock.push(gamefile);
		guiclock.push(gamefile);
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

	return move;
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

	while (true) { // For as long as we have moves to forward...
		const nextIndex = gamefile.moveIndex + 1;
		if (moveutil.isIndexOutOfRange(gamefile.moves, nextIndex)) break;

		const nextMove = moveutil.getMoveFromIndex(gamefile.moves, nextIndex);

		const isLastMove = moveutil.isIndexTheLastMove(gamefile.moves, nextIndex);
		const animate = animateLastMove && isLastMove;
		makeMove(gamefile, nextMove, { recordMove: false, pushClock: false, doGameOverChecks: false, flipTurn, animate, updateData, updateProperties, simulated });
	}

	if (!simulated) guigameinfo.updateWhosTurn(gamefile);

	// If updateData is true, lock the rewind/forward buttons for a brief moment.
	if (updateData) guinavigation.lockRewind();
}

/**
 * Rewinds the game until we reach the desired move index.
 * @param {gamefile} gamefile - The gamefile
 * @param {number} moveIndex - The desired move index
 * @param {Object} options - An object containing various options (ALL of these are default *true*, EXCEPT `simulated` which is default *false*):
 * - `removeMove`: Whether to delete the moves in the gamefile's moves list while rewinding.
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves, or if you're planning on regenerating the mesh after this.
 */
function rewindGameToIndex(gamefile, moveIndex, { removeMove = true, updateData = true } = {}) {
	if (removeMove && !moveutil.areWeViewingLatestMove(gamefile)) return console.error("Cannot rewind game to index while deleting moves unless we start at the most recent move. forwardToFront() first.");
	if (gamefile.moveIndex < moveIndex) return console.error("Cannot rewind game to index when we need to forward instead.");
	while (gamefile.moveIndex > moveIndex) rewindMove(gamefile, { animate: false, updateData, removeMove });
	guigameinfo.updateWhosTurn(gamefile);
	frametracker.onVisualChange();
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
function rewindMove(gamefile, { updateData = true, removeMove = true, animate = true } = {}) {

	const move = moveutil.getMoveFromIndex(gamefile.moves, gamefile.moveIndex); // { type, startCoords, endCoords, captured }
	const trimmedType = colorutil.trimColorExtensionFromType(move.type);

	let isSpecialMove = false;
	if (gamefile.specialUndos[trimmedType]) isSpecialMove = gamefile.specialUndos[trimmedType](gamefile, move, { updateData, animate });
	if (!isSpecialMove) rewindMove_NoSpecial(gamefile, move, { updateData, animate });

	// inCheck and attackers are always restored, no matter if we're deleting the move or not.
	gamefile.inCheck = move.rewindInfo.inCheck;
	if (move.rewindInfo.attackers) gamefile.attackers = move.rewindInfo.attackers;
	if (removeMove) { // Restore original values
		gamefile.enpassant = move.rewindInfo.enpassant;
		gamefile.moveRuleState = move.rewindInfo.moveRuleState;
		gamefile.checksGiven = move.rewindInfo.checksGiven;
		if (move.rewindInfo.specialRightStart) { // Restore their special right
			const key = coordutil.getKeyFromCoords(move.startCoords);
			gamefile.specialRights[key] = true;
		}
		if (move.rewindInfo.specialRightEnd) { // Restore their special right
			const key = coordutil.getKeyFromCoords(move.endCoords);
			gamefile.specialRights[key] = true;
		}
		gamefile.gameConclusion = move.rewindInfo.gameConclusion; // Simulated moves may or may not have performed game over checks.
	}
	// The capturedIndex and pawnIndex are only used for undo'ing
	// simulated moves, so that we don't screw up the mesh
	delete move.rewindInfo.capturedIndex;
	delete move.rewindInfo.pawnIndex;

	// Finally, delete the move off the top of our moves [] array list
	if (removeMove) moveutil.deleteLastMove(gamefile.moves);
	gamefile.moveIndex--;

	if (removeMove) flipWhosTurn(gamefile, { pushClock: false, doGameOverChecks: false });

	// if (animate) updateInCheck(gamefile, false)
	// No longer needed, as rewinding the move restores the inCheck property.
	// updateInCheck(gamefile, false)

	if (updateData) {
		guinavigation.update_MoveButtons();
		frametracker.onVisualChange();
	}
}

/**
 * Standardly rewinds a move. Adds back any captured piece. Animates if specified.
 * If the move was a special move, a separate method is needed.
 * @param {gamefile} gamefile - The gamefile
 * @param {Move} move - The move that's being undo'd
 * @param {Object} options - An object containing various options (ALL of these are default *true*):
 * - `updateData`: Whether to modify the mesh of all the pieces. Should be false for simulated moves, or if you're planning on regenerating the mesh afterward.
 * - `animate`: Whether to animate this move.
 */
function rewindMove_NoSpecial(gamefile, move, { updateData = true, animate = true } = {}) {
	const movedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords); // Returns { type, index, coords }
	movePiece(gamefile, movedPiece, move.startCoords, { updateData }); // Changes the pieces coords and data in the organized lists without making any captures.

	if (move.captured) { // Replace the piece captured
		const type = move.captured;
		addPiece(gamefile, type, move.endCoords, move.rewindInfo.capturedIndex, { updateData });
	}

	if (animate) animation.animatePiece(move.type, move.endCoords, move.startCoords);
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
	makeMove(gamefile, move, { pushClock: false, animate: false, updateData: false, simulated: true, doGameOverChecks, updateProperties: doGameOverChecks });
    
	// What info can we pull from the game after simulating this move?
	const info = {
		isCheck: doGameOverChecks ? gamefile.inCheck : checkdetection.detectCheck(gamefile, colorToTestInCheck, []),
		gameConclusion: doGameOverChecks ? gamefile.gameConclusion : undefined
	};

	// Undo the move, REWIND.
	// We don't have to worry about the index changing, it is the same.
	// BUT THE CAPTURED PIECE MUST be inserted in the exact location!
	// Only remove the move
	rewindMove(gamefile, { updateData: false, animate: false });

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
	movePiece,
	addPiece,
	deletePiece,
	makeAllMovesInGame,
	calculateMoveFromShortmove,
	forwardToFront,
	rewindGameToIndex,
	rewindMove,
	simulateMove,
	stripSpecialMoveTagsFromCoords
};