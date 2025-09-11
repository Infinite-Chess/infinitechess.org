
/**
 * This script handles the logical side of moving pieces, nothing graphical.
 * 
 * Both ends, client & server, should be able to use this script.
 */


import type { Board, FullGame } from './gamefile.js';
import type { Piece } from '../util/boardutil.js';
import type { Coords } from '../util/coordutil.js';
import type { EnPassant, MoveState } from './state.js';
import type { Change } from './boardchanges.js';
import type { ServerGameMoveMessage } from '../../../../../server/game/gamemanager/gameutility.js';
import type { _Move_Compact } from './icn/icnconverter.js';


import typeutil from '../util/typeutil.js';
import coordutil from '../util/coordutil.js';
import state from './state.js';
import boardchanges from './boardchanges.js';
import boardutil from '../util/boardutil.js';
import moveutil from '../util/moveutil.js';
import { rawTypes } from '../util/typeutil.js';
import icnconverter from './icn/icnconverter.js';
import legalmoves from './legalmoves.js';
import checkdetection from './checkdetection.js';
import specialdetect from './specialdetect.js';
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
	dir: 1n | -1n,
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

/**
 * Move object of the BaseGame.
 * Does not need a ton of details.
 */
interface BaseMove extends _Move_Compact {
	/**
	 * How much time the player had left after they made their move, in millis.
	 * 
	 * Server is always boss, we cannot set this until after the
	 * server responds back with the updated clock information.
	 */
	clockStamp?: number,
	/** The move in most compact notation: `8,7>8,8=Q` */
	compact: string,
}

/** What a move looks like, before movepiece.js creates the `changes`, `state`, `compact`, and `generateIndex` properties on it. */
interface MoveDraft extends _Move_Compact {
	/** Present if the move was a double pawn push. This is the enpassant state that should be placed on the gamefile when making this move. */
	enpassantCreate?: enpassantCreate,
	/** Present if the move was special-move enpassant capture. This will be `true` */
	enpassant?: enpassant,
	/** Present if the move was a special-move casle. This may look like an
	 * object: `{ coord, dir }` where `coord` is the starting coordinates of the
	 * rook being castled with, and `dir` is the direction castled, 1 for right and -1 for left. */
	castle?: castle,
	/** Present if the move is for a Rose. */
	path?: path,
}

/** Information about some change on the chessboard, either by a move or some other property change (e.g. as used in the board editor) */
interface Edit {
	/** A list of changes the move made to the board, whether it moved a piece, captured a piece, added a piece, etc. */
	changes: Array<Change>,
	/** The state of the move is used to know how to modify specific gamefile
	 * properties when forwarding/rewinding this move. */
	state: MoveState
}

/**
 * Contains all properties a {@link MoveDraft} and a {@link Edit} has, and more.
 * Including the changes it made to the board, the gamefile
 * state before and after the move, etc.
 */
interface Move extends Edit, MoveDraft, BaseMove {
	/** The type of piece moved */
	type: number,
	/** The index this move was generated for. This can act as a safety net
	 * so we don't accidentally make the move on the wrong index of the game. */
	generateIndex: number,
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
}

// Move Generating --------------------------------------------------------------------------------------------------


/**
 * Generates a full Move object from a MoveDraft,
 * calculating and appending its board changes to its Changes list,
 * and queueing its gamefile StateChanges.
 */
function generateMove(gamefile: FullGame, moveDraft: MoveDraft): Move {
	const { boardsim } = gamefile;
	const piece = boardutil.getPieceFromCoords(boardsim.pieces, moveDraft.startCoords);
	if (!piece) throw Error(`Cannot make move because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`);

	// Construct the full Move object
	// Initialize the state, and change list, as empty for now.
	const move: Move = {
		...moveDraft,
		type: piece.type,
		changes: [],
		generateIndex: boardsim.state.local.moveIndex + 1,
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
	state.createEnPassantState(move, boardsim.state.global.enpassant, undefined);

	const isNullMove = moveutil.isMoveNullMove(moveDraft);
	if (!isNullMove) {
		const rawType = typeutil.getRawType(move.type);
		let specialMoveMade: boolean = false;
		// If a special move function exists for this piece type, run it.
		// The actual function will return whether a special move was actually made or not.
		// If a special move IS made, we skip the normal move piece method.
		if (rawType in boardsim.specialMoves) specialMoveMade = boardsim.specialMoves[rawType]!(boardsim, piece, move);
		if (!specialMoveMade) calcMovesChanges(boardsim, piece, moveDraft, move); // Move piece regularly (no special tag)

		// Must be set before calling queueIncrementMoveRuleStateChange()
		move.flags.capture = boardchanges.wasACapture(move);
		
		// Delete all special rights that should be revoked from the move.
		queueSpecialRightDeletionStateChanges(boardsim, move);
	}
	queueIncrementMoveRuleStateChange(gamefile, move);

	return move;
}

/**
 * Calculates all of a move's board changes, and "queues" them,
 * adding them to the move's Changes list.
 * 
 * This should NOT be used if the move is a special move.
 * @param boardsim - The board
 * @param piece - The piece that's being moved
 * @param move - The move that's being made
 */
function calcMovesChanges(boardsim: Board, piece: Piece, moveDraft: _Move_Compact, edit: Edit) {
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, moveDraft.endCoords);

	if (capturedPiece) boardchanges.queueCapture(edit.changes, true, capturedPiece);
	boardchanges.queueMovePiece(edit.changes, true, piece, moveDraft.endCoords);
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
function queueSpecialRightDeletionStateChanges(boardsim: Board, edit: Edit) {
	edit.changes.forEach(change => {
		if (change.action === 'move') {
			// Delete the special rights off the start coords, if there is one (createSpecialRightsState() early exits if there isn't)
			const startCoordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(edit, startCoordsKey, boardsim.state.global.specialRights.has(startCoordsKey), false);
		} else if (change.action === 'capture') {
			 // Future protection if the captured piece is ever not on the move's endCoords
			const captureCoordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(edit, captureCoordsKey, boardsim.state.global.specialRights.has(captureCoordsKey), false);
		} else if (change.action === 'delete') {
			// Delete the special rights of the coords, if there is one.
			const coordsKey = coordutil.getKeyFromCoords(change.piece.coords);
			state.createSpecialRightsState(edit, coordsKey, boardsim.state.global.specialRights.has(coordsKey), false);
		}
	});
}

/**
 * Increments the gamefile's moveRuleStatus property, if the move-rule is in use.
 */
function queueIncrementMoveRuleStateChange({ basegame, boardsim }: FullGame, move: Move) {
	if (!basegame.gameRules.moveRule) return; // Not using the move-rule
    
	// Reset if it was a capture or pawn movement
	const newMoveRule = !move.flags.capture && typeutil.getRawType(move.type) !== rawTypes.PAWN ? boardsim.state.global.moveRuleState! + 1 : 0;
	state.createMoveRuleState(move, boardsim.state.global.moveRuleState!, newMoveRule);
}


// Forwarding -------------------------------------------------------------------------------------------------------


/**
 * Executes all the logical board changes of a global forward move in the game, no graphical changes.
 */
function makeMove(gamefile: FullGame, move: Move) {
	gamefile.boardsim.moves.push(move);
	gamefile.basegame.moves.push({
		startCoords: move.startCoords,
		endCoords: move.endCoords,
		promotion: move.promotion,
		compact: move.compact,
	});


	applyMove(gamefile, move, true, { global: true }); // Apply the logical boardsim changes.

	// This needs to be after the moveIndex is updated
	updateTurn(gamefile);

	// Now we can test for check, and modify the state of the gamefile if it is.
	createCheckState(gamefile, move);
	if (gamefile.boardsim.state.local.inCheck) move.flags.check = true;
	// The "mate" property of the move will be added after our game conclusion checks...
}

/**
 * Applies a move's board changes to the gamefile, and updates moveIndex.
 * No graphical changes.
 * @param gamefile 
 * @param move 
 * @param forward - Whether the move's board changes should be applied forward or backward.
 * @param [options.global] - If true, we will also apply this move's global state changes to the gamefile
 */
function applyMove(gamefile: FullGame, move: Move, forward = true, { global = false } = {}) {
	gamefile.boardsim.state.local.moveIndex += forward ? 1 : -1; // Update the gamefile moveIndex

	// Stops stupid missing piece errors
	const indexToApply = gamefile.boardsim.state.local.moveIndex + Number(!forward);
	if (indexToApply !== move.generateIndex) throw new Error(`Move was expected at index ${move.generateIndex} but applied at ${indexToApply} (forward: ${forward}).`);

	applyEdit(gamefile, move, forward, global); // Apply the board changes
}

/**
 * Applies a edits board changes to the gamefile.
 * If we're applying a board editor's move's edits, then global should be true.
 * @param gamefile - The gamefile to apply the edit to.
 * @param edit - The edit to apply, which contains the changes and state of the move. 
 * @param global - If true, we will also apply this move's global state changes to the gamefile. Should be true if the edit is from a board editor move.
 * @param forward - Whether the move's board changes should be applied forward or backward.
 */
function applyEdit(gamefile: FullGame, edit: Edit, forward: boolean, global: boolean) {
	state.applyMove(gamefile.boardsim.state, edit.state, forward, { globalChange: global }); // Apply the State of the move
	boardchanges.runChanges(gamefile, edit.changes, boardchanges.changeFuncs, forward); // Logical board changes
}

/**
 * Updates the `whosTurn` property of the gamefile, according to the move index we're on.
 */
function updateTurn(gamefile: FullGame) {
	gamefile.basegame.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile.basegame, gamefile.boardsim.state.local.moveIndex);
}

/**
 * Tests if the gamefile is currently in check,
 * then creates and set's the game state to reflect that.
 */
function createCheckState(gamefile: FullGame, move: Move ) {
	const {boardsim, basegame} = gamefile;
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(basegame, boardsim.state.local.moveIndex);
	const oppositeColor = typeutil.invertPlayer(whosTurnItWasAtMoveIndex)!;
	// Only track attackers if we're using checkmate win condition.
	const trackAttackers = basegame.gameRules.winConditions[oppositeColor]!.includes('checkmate');

	const checkResults = checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, trackAttackers); // { check: boolean, royalsInCheck: Coords[], attackers?: Attacker[] }
	const futureInCheck = checkResults.check === false ? false : checkResults.royalsInCheck;
	// Passing in the gamefile into this method tells state.ts to immediately apply the state change.
	state.createCheckState(move, boardsim.state.local.inCheck, futureInCheck, boardsim.state); // Passes in the gamefile as an argument
	state.createAttackersState(move, boardsim.state.local.attackers, checkResults.attackers ?? [], boardsim.state); // Erase the checking pieces calculated from previous turn and pass in new on
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
function makeAllMovesInGame(gamefile: FullGame, moves: ServerGameMoveMessage[]) {
	if (gamefile.boardsim.moves.length > 0) throw Error("Cannot make all moves in game when there are already moves played.");
	moves.forEach((shortmove, i) => {
		const move: Move = calculateMoveFromShortmove(gamefile, shortmove);
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
function calculateMoveFromShortmove(gamefile: FullGame, shortmove: ServerGameMoveMessage): Move {
	if (!moveutil.areWeViewingLatestMove(gamefile.boardsim)) throw Error("Cannot calculate Move object from shortmove when we're not viewing the most recently played move.");

	// Reconstruct the startCoords, endCoords, and special move properties of the MoveDraft

	let moveDraft: MoveDraft;
	try {
		moveDraft = icnconverter.parseCompactMove(shortmove.compact);
	} catch (error) {
		console.error(error);
		throw Error(`Failed to calculate Move from shortmove because it's in an incorrect format: ${shortmove.compact}`);
	}

	// Reconstruct the special move properties by calculating what legal
	// special moves this piece can make, comparing them to the move's endCoords,
	// and if there's a match, pass on the special move flag.

	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.startCoords);
	if (!piece) {
		// No piece on start coordinates, can't calculate Move, because it's illegal
		throw Error(`Failed to calculate Move from shortmove because there's no piece on the start coords: ${shortmove.compact}`);
	}

	const moveset = legalmoves.getPieceMoveset(gamefile.boardsim, piece.type);
	const legalSpecialMoves = legalmoves.getEmptyLegalMoves(moveset);
	legalmoves.appendSpecialMoves(gamefile, piece, moveset, legalSpecialMoves, false);
	for (const thisCoord of legalSpecialMoves.individual) {
		if (!coordutil.areCoordsEqual(thisCoord, moveDraft.endCoords)) continue;
		// Matched coordinates! Transfer any special move tags
		specialdetect.transferSpecialFlags_FromCoordsToMove(thisCoord, moveDraft);
		break;
	}

	const move = generateMove(gamefile, moveDraft);
	if (shortmove.clockStamp !== undefined) move.clockStamp = shortmove.clockStamp;
	return move;
}


// Rewinding -------------------------------------------------------------------------------------------------------


/**
 * Executes all the logical board changes of a global REWIND move in the game, no graphical changes.
 */
function rewindMove(gamefile: FullGame) {
	// console.error("Rewinding move");
	const move = moveutil.getMoveFromIndex(gamefile.boardsim.moves, gamefile.boardsim.state.local.moveIndex);

	applyMove(gamefile, move, false, { global: true });

	// Delete the move off the end of our moves list
	gamefile.boardsim.moves.pop();
	gamefile.basegame.moves.pop();
	
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
// eslint-disable-next-line no-unused-vars
function goToMove(boardsim: Board, index: number, callback: (move: Move ) => void) {
	if (index === boardsim.state.local.moveIndex) return;

	const forwards = index >= boardsim.state.local.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = boardsim.state.local.moveIndex;
	
	if (boardsim.moves.length <= index + offset || index + offset < 0) throw Error("Target index is outside of the movelist!");

	while (i !== index) {
		i = moveTowards(i, index, 1);
		const move = boardsim.moves[i + offset];
		if (move === undefined) throw Error(`Undefined move in goToMove()! ${i}, ${index}`);
		callback(move);
	}
}

/**
 * Starts with `s`, steps it by +-`progress` towards `e`, then returns that number.
 */
function moveTowards(s: number, e: number, progress: number): number {
	return s + Math.sign(e - s) * Math.min(Math.abs(e - s), progress);
}


// Move Wrappers ----------------------------------------------------------------------------------------------------


/**
 * Wraps a function in a simulated move.
 * The callback may be used to obtain whatever
 * property of the gamefile we want after the move is made.
 * The move is automatically rewound when it's done.
 * @returns Whatever is returned by the callback
 */
function simulateMoveWrapper<R>(gamefile: FullGame, moveDraft: MoveDraft, callback: () => R): R {
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
function getSimulatedConclusion(gamefile: FullGame, moveDraft: MoveDraft): string | undefined {
	return simulateMoveWrapper(
		gamefile,
		moveDraft,
		() => wincondition.getGameConclusion(gamefile)
	);
}

// ---------------------------------------------------------------------------------------------------------------------


export type {
	Move,
	Edit,
	BaseMove,
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
	calcMovesChanges,
	queueSpecialRightDeletionStateChanges,
	makeMove,
	updateTurn,
	goToMove,
	makeAllMovesInGame,
	applyMove,
	applyEdit,
	rewindMove,
	simulateMoveWrapper,
	getSimulatedConclusion,
};