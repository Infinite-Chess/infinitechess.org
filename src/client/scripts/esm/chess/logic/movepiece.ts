
/**
 * This script handles the logical side of moving pieces, nothing graphical.
 * 
 * Both ends, client & server, should be able to use this script.
 */


// @ts-ignore
import type gamefile from './gamefile.js';
import type { Piece } from '../util/boardutil.js';
import type { Coords } from '../util/coordutil.js';
import type { EnPassant, MoveState } from './state.js';
import type { Change } from './boardchanges.js';
import typeutil from '../util/typeutil.js';
import coordutil from '../util/coordutil.js';
import state from './state.js';
import boardchanges from './boardchanges.js';
import boardutil from '../util/boardutil.js';
import moveutil from '../util/moveutil.js';
import { rawTypes } from '../util/typeutil.js';
import icnconverter from './icn/icnconverter.js';
// @ts-ignore
import legalmoves from './legalmoves.js';
// @ts-ignore
import specialdetect from './specialdetect.js';
// @ts-ignore
import math from '../../util/math.js';
// @ts-ignore
import checkdetection from './checkdetection.js';
// @ts-ignore
import wincondition from './wincondition.js';

// Type Definitions ---------------------------------------------------------------------------------------------------------------


/**
 * A pair of coordinates, WITH attached special move information.
 * This usually denotes a legal square you can move to that will
 * activate said special move.
 */
type CoordsSpecial = Coords & { 
	enpassantCreate?: enpassantCreate,
	enpassant?: enpassant,
	promoteTrigger?: promoteTrigger,
	promotion?: promotion,
	castle?: castle,
	path?: path,
}

/** Special move tag that, when present, making the move will create an enpassant state on the gamefile. */
type enpassantCreate = EnPassant
/**
 * A special move tag for enpassant capture.
 * 
 * If true, the specialMove function for pawns will read the gamefile's
 * enpassant property to figure out where the pawn to capture is.
 * After that, the captured piece is appended to the move's changes list,
 * So we don't actually need to store more information in here.
 */
type enpassant = true;
/**
 * A special move tag that, when the move is attempted to be made, should trigger the promotion UI to open.
 * The special detect functions are in charge of adding this. selection.ts will delete it and open the promotion UI.
 */
type promoteTrigger = boolean;
/** A special move tag for pawn promotion. This is the integer type of the piece promoted to. */
type promotion = number;
/** A special move tag for castling. */
type castle = {
	/** 1 => King castled right   2 => King castled left */
	dir: 1 | -1,
	/** The coordinate of the piece the king castled with, usually a rook. */
	coord: Coords
}
/**
 * A special move tag that stores a list of all the waypoints along
 * the travel path of a piece. Inclusive to start and end.
 * 
 * Used for Rose piece.
 */
type path = Coords[]

/** What a move looks like, before movepiece.js creates the `changes`, `state`, `compact`, and `generateIndex` properties on it. */
interface MoveDraft {
	startCoords: Coords,
	endCoords: Coords,

	// Special move tags...

	/** Present if the move was a double pawn push. This is the enpassant state that should be placed on the gamefile when making this move. */
	enpassantCreate?: enpassantCreate,
	/** Present if the move was special-move enpassant capture. This will be `true` */
	enpassant?: enpassant,
	/** Present if the move was a special-move promotion. This is the integer type of the promoted piece. */
	promotion?: promotion,
	/** Present if the move was a special-move casle. This may look like an
	 * object: `{ coord, dir }` where `coord` is the starting coordinates of the
	 * rook being castled with, and `dir` is the direction castled, 1 for right and -1 for left. */
	castle?: castle,
	/** Present if the move is for a Rose. */
	path?: path,
}

/**
 * Contains all properties a {@link MoveDraft} has, and more.
 * Including the changes it made to the board, the gamefile
 * state before and after the move, etc.
 */
interface Move extends MoveDraft {
	/** Whether the move is a null move. */
	isNull: false,
	/** The type of piece moved */
	type: number,
	/** A list of changes the move made to the board, whether it moved a piece, captured a piece, added a piece, etc. */
	changes: Array<Change>,
	/** The state of the move is used to know how to modify specific gamefile
	 * properties when forwarding/rewinding this move. */
	state: MoveState,
	/** The index this move was generated for. This can act as a safety net
	 * so we don't accidentally make the move on the wrong index of the game. */
	generateIndex: number,
	/** The move in most compact notation: `8,7>8,8=Q` */
	compact: string,
	flags: {
		/** Whether the move delivered check. */
		check: boolean,
		/** Whether the move delivered mate (or the killing move). */
		mate: boolean,
		/** Whether the move caused a capture */
		capture: boolean,
	}
	/**
	 * Any comment made on the move, specified in the ICN.
	 * These will go back into the ICN when copying the game.
	 */
	comment?: string,
	/**
	 * How much time the player had left after they made their move, in millis.
	 * 
	 * Server is always boss, we cannot set this until after the
	 * server responds back with the updated clock information.
	 */
	clk?: number,
}

/**
 * A null/passing move made by engines during their search calculation.
 * 
 * The only info this needs is how the gamefile state changes.
*/
interface NullMove {
	/** Whether the move is a null move. */
	isNull: true,
	/** The index this move was generated for. This can act as a safety net
	 * so we don't accidentally make the move on the wrong index of the game. */
	generateIndex: number,
	/** The state of the move is used to know how to modify specific gamefile
	 * properties when forwarding/rewinding this move. */
	state: MoveState,
	flags: {
		/** Whether the move delivered check. */
		check: boolean,
		/** Whether the move delivered mate (or the killing move). */
		mate: boolean,
		/** Whether the move caused a capture */
		capture: boolean,
	}
}


// Move Generating --------------------------------------------------------------------------------------------------


/**
 * Generates a full Move object from a MoveDraft,
 * calculating and appending its board changes to its Changes list,
 * and queueing its gamefile StateChanges.
 */
function generateMove(gamefile: gamefile, moveDraft: MoveDraft): Move {
	const piece = boardutil.getPieceFromCoords(gamefile.pieces, moveDraft.startCoords);
	if (!piece) throw Error(`Cannot make move because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`);

	// Construct the full Move object
	// Initialize the state, and change list, as empty for now.
	const move: Move = {
		...moveDraft,
		isNull: false,
		type: piece.type,
		changes: [],
		generateIndex: gamefile.moveIndex + 1,
		state: { local: [], global: [] },
		compact: icnconverter.getCompactMoveFromDraft(moveDraft),
		flags: {
			// These will be set later, but we need a default value
			check: false,
			mate: false,
			capture: false,
		}
	};

	/**
	 * Delete the current enpassant state.
	 * If any specialMove function adds a new EnPassant state,
	 * this one's future value will be overwritten
	 */
	state.createEnPassantState(move, gamefile.enpassant, undefined);

	const rawType = typeutil.getRawType(move.type);
	let specialMoveMade: boolean = false;
	// If a special move function exists for this piece type, run it.
	// The actual function will return whether a special move was actually made or not.
	// If a special move IS made, we skip the normal move piece method.
	if (rawType in gamefile.specialMoves) specialMoveMade = gamefile.specialMoves[rawType](gamefile, piece, move);
	if (!specialMoveMade) calcMovesChanges(gamefile, piece, move); // Move piece regularly (no special tag)

	// Must be set before calling queueIncrementMoveRuleStateChange()
	move.flags.capture = boardchanges.wasACapture(move);
	
	// Delete all special rights that should be revoked from the move.
	queueSpecialRightDeletionStateChanges(gamefile, move);
	queueIncrementMoveRuleStateChange(gamefile, move);

	return move;
}

/** Generates a Null Move used by engines. */
function generateNullMove(gamefile: gamefile) {
	const nullMove: NullMove = {
		isNull: true,
		generateIndex: gamefile.moveIndex + 1,
		state: { local: [], global: [] },
		flags: {
			// These will be set later, but we need a default value
			check: false,
			mate: false,
			capture: false,
		}
	};

	/**
	 * Delete the current enpassant state.
	 * If any specialMove function adds a new EnPassant state,
	 * this one's future value will be overwritten
	 */
	state.createEnPassantState(nullMove, gamefile.enpassant, undefined);
	queueIncrementMoveRuleStateChange(gamefile, nullMove);

	return nullMove;
}

/**
 * Calculates all of a move's board changes, and "queues" them,
 * adding them to the move's Changes list.
 * 
 * This should NOT be used if the move is a special move.
 * @param gamefile - The gamefile
 * @param piece - The piece that's being moved
 * @param move - The move that's being made
 */
function calcMovesChanges(gamefile: gamefile, piece: Piece, move: Move) {

	const capturedPiece = boardutil.getPieceFromCoords(gamefile.pieces, move.endCoords);

	if (capturedPiece) boardchanges.queueCapture(move.changes, true, piece, move.endCoords, capturedPiece);
	else boardchanges.queueMovePiece(move.changes, true, piece, move.endCoords);
}

/**
 * Queues gamefile state changes to delete all 
 * special rights that should have been revoked from the move.
 * This includes the startCoords and endCoords of all move actions.
 * 
 * TODO: ITERATE THROUGH all pieces with their special rights, and delete
 * the ones that are now useless (i.e. rooks have no royal they could ever castle with).
 * This will upgrade the repetition algorithm to not delay declaring a draw
 * if a rook moves that had its special right, but could never castle. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 */
function queueSpecialRightDeletionStateChanges(gamefile: gamefile, move: Move) {
	move.changes.forEach(change => {
		if (change.action === 'move') {
			// Delete the special rights off the start coords, if there is one (createSpecialRightsState() early exits if there isn't)
			const startCoordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(move, startCoordsKey, gamefile.specialRights.has(startCoordsKey), false);
		} else if (change.action === 'capture') {
			// Delete the special rights off the start coords AND the capture coords, if there are ones.
			const startCoordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(move, startCoordsKey, gamefile.specialRights.has(startCoordsKey), false);
			const captureCoordsKey = coordutil.getKeyFromCoords(change.capturedPiece.coords); // Future protection if the captured piece is ever not on the move's endCoords
			state.createSpecialRightsState(move, captureCoordsKey, gamefile.specialRights.has(captureCoordsKey), false);
		} else if (change.action === 'delete') {
			// Delete the special rights of the coords, if there is one.
			const coordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(move, coordsKey, gamefile.specialRights.has(coordsKey), false);
		}
	});
}

/**
 * Increments the gamefile's moveRuleStatus property, if the move-rule is in use.
 */
function queueIncrementMoveRuleStateChange(gamefile: gamefile, move: Move | NullMove) {
	if (!gamefile.gameRules.moveRule) return; // Not using the move-rule
    
	// Reset if it was a capture or pawn movement
	const newMoveRule = move.isNull || !move.flags.capture && typeutil.getRawType(move.type) !== rawTypes.PAWN ? gamefile.moveRuleState + 1 : 0;
	state.createMoveRuleState(move, gamefile.moveRuleState, newMoveRule);
}


// Forwarding -------------------------------------------------------------------------------------------------------


/**
 * Executes all the logical board changes of a global forward move in the game, no graphical changes.
 */
function makeMove(gamefile: gamefile, move: Move | NullMove) {
	gamefile.moves.push(move);

	applyMove(gamefile, move, true, { global: true }); // Apply the logical board changes.

	// This needs to be after the moveIndex is updated
	updateTurn(gamefile);

	// Now we can test for check, and modify the state of the gamefile if it is.
	createCheckState(gamefile, move);
	if (gamefile.inCheck) move.flags.check = true;
	// The "mate" property of the move will be added after our game conclusion checks...
}

/**
 * Applies a move's board changes to the gamefile, no graphical changes.
 * Also updates the gamefile's `moveIndex`.
 * @param gamefile 
 * @param move 
 * @param forward - Whether the move's board changes should be applied forward or backward.
 * @param [options.global] - If true, we will also apply this move's global state changes to the gamefile
 */
function applyMove(gamefile: gamefile, move: Move | NullMove, forward = true, { global = false } = {}) {
	gamefile.moveIndex += forward ? 1 : -1; // Update the gamefile moveIndex

	// Stops stupid missing piece errors
	const indexToApply = gamefile.moveIndex + Number(!forward);
	if (indexToApply !== move.generateIndex) throw new Error(`Move was expected at index ${move.generateIndex} but applied at ${indexToApply} (forward: ${forward}).`);

	state.applyMove(gamefile, move, forward, { globalChange: global }); // Apply the State of the move

	if (move.isNull) return; // Null moves don't have changes to make

	boardchanges.runChanges(gamefile, move.changes, boardchanges.changeFuncs, forward); // Logical board changes
}

/**
 * Updates the `whosTurn` property of the gamefile, according to the move index we're on.
 */
function updateTurn(gamefile: gamefile) {
	gamefile.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
}

/**
 * Tests if the gamefile is currently in check,
 * then creates and set's the game state to reflect that.
 */
function createCheckState(gamefile: gamefile, move: Move | NullMove) {
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = typeutil.invertPlayer(whosTurnItWasAtMoveIndex)!;
	// Only track attackers if we're using checkmate win condition.
	const trackAttackers = gamefile.gameRules.winConditions[oppositeColor].includes('checkmate');

	const checkResults = checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
	const futureInCheck = checkResults.check === false ? false : checkResults.royalsInCheck;
	// Passing in the gamefile into this method tells state.ts to immediately apply the state change.
	state.createCheckState(move, gamefile.inCheck, futureInCheck, gamefile); // Passes in the gamefile as an argument
	state.createAttackersState(move, gamefile.attackers, checkResults.attackers ?? [], gamefile); // Erase the checking pieces calculated from previous turn and pass in new on
}

/**
 * Accepts a move list in the most comapact form: `['1,2>3,4','10,7>10,8Q']`,
 * reconstructs each move's properties, INCLUDING special flags, and makes that move
 * in the game. At each step it has to calculate what legal special
 * moves are possible, so it can pass on those flags.
 * 
 * **THROWS AN ERROR** if any move during the process is in an invalid format.
 * @param gamefile - The gamefile
 * @param moves - The list of moves to add to the game, each in the most compact format: `['1,2>3,4','10,7>10,8Q']`
 */
function makeAllMovesInGame(gamefile: gamefile, moves: string[]) {
	if (gamefile.moves.length > 0) throw Error("Cannot make all moves in game when there are already moves played.");
	moves.forEach((shortmove, i) => {
		const move = calculateMoveFromShortmove(gamefile, shortmove);
		if (!move) throw Error(`Cannot make all moves in game! There was one invalid move: ${shortmove}. Index: ${i}`);
		makeMove(gamefile, move);
	});
}

/**
 * Accepts a move in the most compact short form, and constructs the whole Move object.
 * This has to calculate the piece's legal special
 * moves to be able to deduce if the move was a special move.
 * 
 * **Returns undefined** if there was an error anywhere in the conversion.
 * 
 * This does NOT perform legality checks, so still do that afterward.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} shortmove - The move in most compact form: `1,2>3,4Q`
 * @returns {Move | undefined} The move object, or undefined if there was an error.
 */
function calculateMoveFromShortmove(gamefile: gamefile, shortmove: string): Move | undefined {
	if (!moveutil.areWeViewingLatestMove(gamefile)) throw Error("Cannot calculate Move object from shortmove when we're not viewing the most recently played move.");

	// Reconstruct the startCoords, endCoords, and special move properties of the MoveDraft

	let moveDraft: MoveDraft;
	try {
		moveDraft = icnconverter.parseCompactMove(shortmove);
	} catch (error) {
		console.error(error);
		console.error(`Failed to calculate Move from shortmove because it's in an incorrect format: ${shortmove}`);
		return;
	}

	// Reconstruct the special move properties by calculating what legal
	// special moves this piece can make, comparing them to the move's endCoords,
	// and if there's a match, pass on the special move flag.

	const piece = boardutil.getPieceFromCoords(gamefile.pieces, moveDraft.startCoords);
	if (!piece) {
		console.error(`Failed to calculate Move from shortmove because there's no piece on the start coords: ${shortmove}`);
		return; // No piece on start coordinates, can't calculate Move, because it's illegal
	}

	const legalSpecialMoves: Coords[] = legalmoves.calculate(gamefile, piece, { onlyCalcSpecials: true }).individual;
	for (let i = 0; i < legalSpecialMoves.length; i++) {
		const thisCoord: Coords = legalSpecialMoves[i]!;
		if (!coordutil.areCoordsEqual(thisCoord, moveDraft.endCoords)) continue;
		// Matched coordinates! Transfer any special move tags
		specialdetect.transferSpecialFlags_FromCoordsToMove(thisCoord, moveDraft);
		break;
	}

	return generateMove(gamefile, moveDraft);
}


// Rewinding -------------------------------------------------------------------------------------------------------


/**
 * Executes all the logical board changes of a global REWIND move in the game, no graphical changes.
 */
function rewindMove(gamefile: gamefile) {
	const move = moveutil.getMoveFromIndex(gamefile.moves, gamefile.moveIndex);

	applyMove(gamefile, move, false, { global: true });

	// Delete the move off the end of our moves list
	gamefile.moves.pop();
	updateTurn(gamefile);
}


// Dynamic -------------------------------------------------------------------------------------------------------


/**
 * Iterates to a certain move index, performing a callback function on each move.
 * The callback should be a move application function, either {@link applyMove}, or movesequence.viewMove(),
 * depending on if each move should make graphical changes or not. Both methods make logical board changes.
 * @param {gamefile} gamefile 
 * @param {number} index 
 * @param {CallableFunction} callback - Either {@link applyMove}, or movesequence.viewMove()
 */
function goToMove(gamefile: gamefile, index: number, callback: CallableFunction) {
	if (index === gamefile.moveIndex) return;

	const forwards = index >= gamefile.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = gamefile.moveIndex;
	
	if (gamefile.moves.length <= index + offset || index + offset < 0) throw Error("Target index is outside of the movelist!");

	while (i !== index) {
		i = math.moveTowards(i, index, 1);
		const move = gamefile.moves[i + offset];
		if (move === undefined) throw Error(`Undefined move in goToMove()! ${i}, ${index}`);
		callback(move);
	}
}


// Move Wrappers ----------------------------------------------------------------------------------------------------


/**
 * Wraps a function in a simulated move.
 * The callback may be used to obtain whatever
 * property of the gamefile we want after the move is made.
 * The move is automatically rewound when it's done.
 * @returns Whatever is returned by the callback
 */
function simulateMoveWrapper<R>(gamefile: gamefile, moveDraft: MoveDraft, callback: () => R): R {
	const move = generateMove(gamefile, moveDraft);
	makeMove(gamefile, move);
	// What info can we pull from the game after simulating this move?
	const info = callback();
	rewindMove(gamefile);
	return info;
}

/**
 * Simulates a move to get the gameConclusion
 * @returns the gameConclusion
 */
function getSimulatedConclusion(gamefile: gamefile, moveDraft: MoveDraft): string | false {
	return simulateMoveWrapper(
		gamefile,
		moveDraft,
		() => wincondition.getGameConclusion(gamefile)
	);
}


// ---------------------------------------------------------------------------------------------------------------------


export type {
	Move,
	NullMove,
	MoveDraft,
	CoordsSpecial,
	enpassantCreate,
	enpassant,
	promoteTrigger,
	promotion,
	castle,
	path
};

export default {
	generateMove,
	generateNullMove,
	makeMove,
	updateTurn,
	goToMove,
	makeAllMovesInGame,
	applyMove,
	rewindMove,
	simulateMoveWrapper,
	getSimulatedConclusion,
};