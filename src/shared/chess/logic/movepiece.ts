// src/shared/chess/logic/movepiece.ts

/**
 * This script handles the logical side of moving pieces, nothing graphical.
 *
 * Both ends, client & server, should be able to use this script.
 */

import type { Piece } from '../util/boardutil.js';
import type { Board } from './boardinit.js';
import type { Coords } from '../util/coordutil.js';
import type { Change } from './boardchanges.js';
import type { MoveState } from './state.js';
import type { MoveCoords } from './icn/icnconverter.js';
import type { MovePacket } from '../../domain.js';
import type { MoveSpecialTags, SpecialTags } from '../util/moveutil.js';

import state from './state.js';
import typeutil from '../util/typeutil.js';
import moveutil from '../util/moveutil.js';
import coordutil from '../util/coordutil.js';
import boardutil from '../util/boardutil.js';
import legalmoves from './legalmoves.js';
import castlingutil from './castlingutil.js';
import boardchanges from './boardchanges.js';
import icnconverter from './icn/icnconverter.js';
import wincondition from './wincondition.js';
import specialdetect from './specialdetect.js';
import checkdetection from './checkdetection.js';
import movevalidation from './movevalidation.js';
import organizedpieces from './organizedpieces.js';
import { rawTypes as r } from '../util/typeutil.js';

// Types --------------------------------------------------------------------------------------------------------------------------

/**
 * A pair of coordinates, WITH attached special move information.
 * This usually denotes a legal square you can move to that will
 * activate said special move.
 */
export type CoordsTagged = Coords & Partial<SpecialTags>;

/** A move as stored in the base game. Does not need a lot of details. */
export interface MoveRecord extends MoveCoords {
	/**
	 * How much time the player had left after they made their move, in millis.
	 *
	 * Server is always boss, we cannot set this until after the
	 * server responds back with the updated clock information.
	 */
	clockStamp?: number;
	/** The move in most compact notation: `8,7>8,8=Q` */
	token: string;
}

/** A {@link MoveCoords} move with all special tags attached. */
export type MoveTagged = MoveCoords & Partial<MoveSpecialTags>;

/** Information about some change on the chessboard, either by a move or some other property change (e.g. as used in the board editor) */
export interface Edit {
	/** A list of changes the move made to the board, whether it moved a piece, captured a piece, added a piece, etc. */
	changes: Array<Change>;
	/** The state of the move is used to know how to modify specific boardsim
	 * properties when forwarding/rewinding this move. */
	state: MoveState;
}

/**
 * All properties of a move needed to apply/unapply it
 * to/from the board state, along with other useful flags.
 */
export interface MoveFull extends Edit, MoveTagged, MoveRecord {
	/** The type of piece moved */
	type: number;
	/** The index this move was generated for. This can act as a safety net
	 * so we don't accidentally make the move on the wrong index of the game. */
	generateIndex: number;
	flags: {
		/** Whether the move delivered check. */
		check: boolean;
		/** Whether the move delivered mate (or the killing move). */
		mate: boolean;
		/** Whether the move caused a capture */
		capture: boolean;
	};
	/**
	 * Any comment made on the move, specified in the ICN.
	 * These will go back into the ICN when copying the game.
	 */
	comment?: string;
}

/**
 * Thrown by {@link makeAllMovesInGame} when a move fails legality validation.
 * Lets callers tell an illegal move apart from a game that couldn't be constructed at all.
 */
export class IllegalMoveError extends Error {}

// Move Generating --------------------------------------------------------------------------------------------------

/**
 * Generates a full MoveFull from a MoveTagged, then immediately applies it to the boardsim.
 * @returns The generated MoveFull object
 */
function generateAndMakeMove(boardsim: Board, moveTagged: MoveTagged): MoveFull {
	const move = generateMove(boardsim, moveTagged);
	makeMove(boardsim, move);
	return move;
}

/**
 * Generates a full MoveFull object from a MoveTagged,
 * calculating and appending its board changes to its Changes list,
 * and queueing its boardsim StateChanges.
 */
function generateMove(boardsim: Board, moveTagged: MoveTagged): MoveFull {
	const piece = boardutil.getPieceFromCoords(boardsim.pieces, moveTagged.startCoords);
	if (!piece)
		throw Error(
			`Cannot make move because no piece exists at coords ${coordutil.stringifyCoords(moveTagged.startCoords)}.`,
		);

	// Construct the full MoveFull object
	// Initialize the state, and change list, as empty for now.
	const move: MoveFull = {
		...moveTagged,
		type: piece.type,
		changes: [],
		generateIndex: boardsim.state.local.moveIndex + 1,
		state: [],
		token: icnconverter.getCompactMoveFromDraft(moveTagged),
		flags: {
			// These will be set later, but we need a default value
			check: false,
			mate: false,
			capture: false,
		},
	};

	/**
	 * Delete the current enpassant state.
	 * If any specialMove function adds a new EnPassant state,
	 * this one's future value will be overwritten
	 */
	state.createEnPassantState(move, boardsim.state.global.enpassant, undefined);

	const rawType = typeutil.getRawType(move.type);
	let specialMoveMade: boolean = false;
	// If a special move function exists for this piece type, run it.
	// The actual function will return whether a special move was actually made or not.
	// If a special move IS made, we skip the normal move piece method.
	if (rawType in boardsim.specialMoves)
		specialMoveMade = boardsim.specialMoves[rawType]!(boardsim, piece, move);
	if (!specialMoveMade) calcMovesChanges(boardsim, piece, moveTagged, move); // Move piece regularly (no special tag)

	// Must be set before calling queueIncrementMoveRuleStateChange()
	move.flags.capture = boardchanges.wasACapture(move);

	// Delete all special rights that should be revoked from the move.
	queueSpecialRightDeletionStateChanges(boardsim, move);

	queueIncrementMoveRuleStateChange(boardsim, move);

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
function calcMovesChanges(boardsim: Board, piece: Piece, moveCoords: MoveCoords, edit: Edit): void {
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, moveCoords.endCoords);

	if (capturedPiece) boardchanges.queueCapture(edit.changes, true, capturedPiece);
	boardchanges.queueMovePiece(edit.changes, true, piece, moveCoords.endCoords);
}

/**
 * Queues boardsim state changes to delete all
 * special rights that should have been revoked from the move.
 * This includes the startCoords and endCoords of all move actions.
 */
function queueSpecialRightDeletionStateChanges(boardsim: Board, edit: Edit): void {
	edit.changes.forEach((change) => {
		if (change.action === 'move' || change.action === 'capture' || change.action === 'delete') {
			// Delete any special rights off the (start coords / captured piece coords / deleted piece coords).
			cascadeDeleteSpecialRights(boardsim, change.piece.coords, edit);
		}
	});
}

/**
 * Helper for, when one square's special rights is deleted,
 * scanning the entire row for all kings and rooks that can
 * no longer have a valid castling partner because of it,
 * and deleting their special rights too.
 */
function cascadeDeleteSpecialRights(boardsim: Board, coords: Coords, edit: Edit): void {
	const coordsKey = coordutil.getKeyFromCoords(coords);
	const hasSpecialRight = boardsim.state.global.specialRights.has(coordsKey);
	if (!hasSpecialRight) return; // No special right existed on square in first place.

	// 1. Delete the rights of the specific piece that moved/died
	state.createSpecialRightsState(edit, coordsKey, hasSpecialRight, false);

	const piece = boardutil.getPieceFromCoords(boardsim.pieces, coords)!;
	const [rawType, player] = typeutil.splitType(piece.type);

	if (rawType === r.PAWN) return; // Pawns cannot castle, them losing their special right doesn't affect others.

	const isTrigger: boolean = typeutil.jumpingRoyals.includes(rawType); // Royals are the castling triggers

	const key = organizedpieces.getKeyFromLine([1n, 0n], coords);
	const row = boardsim.pieces.lines.get('1,0')!.get(key)!;

	// 2. Iterate through all pieces on this rank.
	// If they can no longer castle with any valid partner, delete their special right too.
	for (const idx of row) {
		const candidate = boardutil.getDefinedPieceFromIdx(boardsim.pieces, idx);
		const [candRawType, candPlayer] = typeutil.splitType(candidate.type);

		// Basic Validity Checks
		if (candPlayer !== player) continue; // Affects friends only
		if (candRawType === r.PAWN) continue; // Pawns don't have castling rights

		const candCoordsKey = coordutil.getKeyFromCoords(candidate.coords);
		if (!boardsim.state.global.specialRights.has(candCoordsKey)) continue; // Already has no rights

		// Optimization: If the piece being checked is the same "Role" as the piece that triggered this event,
		// it is unaffected. (e.g. Left Rook moving doesn't stop Right Rook from *potential* castling).
		const candidateIsTrigger = typeutil.jumpingRoyals.includes(candRawType); // Royals are the castling triggers
		if (candidateIsTrigger === isTrigger) continue;

		// 3. Search: Does this candidate have ANY valid partner remaining?
		const hasValidPartner = hasCastlingPartner(
			boardsim,
			candidate,
			// Additional constraint: The partner cannot be the piece that just moved/died
			(partner: Piece) => !coordutil.areCoordsEqual(partner.coords, coords),
		);

		// If no partners were found, this piece is now impotent. Revoke its rights.
		if (!hasValidPartner) state.createSpecialRightsState(edit, candCoordsKey, true, false);
	}
}

/**
 * Determines whether a piece has any valid castling partner on the board.
 * @param candidate - A candidate piece for castling. MUST NOT be a pawn.
 * @param partnerConstraint - An optional function, run for each partner, that must return true for them to be considered valid.
 */
function hasCastlingPartner(
	boardsim: Board,
	candidate: Piece,
	partnerConstraint?: (partner: Piece) => boolean,
): boolean {
	const candRawType = typeutil.getRawType(candidate.type);

	// Safety: pawns cannot have castling partners.
	if (candRawType === r.PAWN) throw new Error('Cannot test if pawn has valid castling partner.');

	const key = organizedpieces.getKeyFromLine([1n, 0n], candidate.coords);
	const row = boardsim.pieces.lines.get('1,0')!.get(key)!;

	// Search: Does this candidate have ANY valid castling partner?
	const hasValidPartner = row.some((partnerIdx) => {
		const partner = boardutil.getDefinedPieceFromIdx(boardsim.pieces, partnerIdx);

		if (!castlingutil.isValidPair(candidate.coords, candidate.type, partner.coords, partner.type))
			return false; // prettier-ignore

		const partnerCoordsKey = coordutil.getKeyFromCoords(partner.coords);
		if (!boardsim.state.global.specialRights.has(partnerCoordsKey)) return false; // Partner must have rights

		// Additional optional constraint checks
		if (partnerConstraint && !partnerConstraint(partner)) return false;

		return true; // Found a valid partner!
	});

	return hasValidPartner;
}

/**
 * Increments the boardsim's moveRuleStatus property, if the move-rule is in use.
 */
function queueIncrementMoveRuleStateChange(boardsim: Board, move: MoveFull): void {
	if (boardsim.gameRules.moveRule === undefined) return; // Not using the move-rule

	// Reset if it was a capture or pawn movement
	const newMoveRule =
		!move.flags.capture && typeutil.getRawType(move.type) !== r.PAWN
			? boardsim.state.global.moveRuleState! + 1
			: 0;
	state.createMoveRuleState(move, boardsim.state.global.moveRuleState!, newMoveRule);
}

// Forwarding -------------------------------------------------------------------------------------------------------

/**
 * Executes all the logical board changes of a global forward move in the game, no graphical changes.
 */
function makeMove(boardsim: Board, move: MoveFull): void {
	boardsim.moves.push(move);

	applyMove(boardsim, move, true, true); // Apply the logical board changes.

	// Now we can test for check, and modify the state of the boardsim if it is.
	createCheckState(boardsim, move);
	if (boardsim.state.local.inCheck) move.flags.check = true;
	// The "mate" property of the move will be added after our game conclusion checks...
}

/**
 * Applies a move's board changes to the boardsim, and updates moveIndex.
 * No graphical changes.
 * @param forward - Whether the move's board changes should be applied forward or backward.
 * @param [options.updateTurn] - If true, re-derives `whosTurn` for the resulting ply. Pass true when
 * making/rewinding a real move, or when the viewed ply is itself a playable position (analysis).
 * Otherwise `whosTurn` stays pinned to the front, as online/engine turn detection requires.
 */
function applyMove(boardsim: Board, move: MoveFull, forward: boolean, updateTurn: boolean): void {
	boardsim.state.local.moveIndex += forward ? 1 : -1; // Update the boardsim moveIndex
	// Needs to be after moveIndex is updated.
	if (updateTurn) boardsim.whosTurn = moveutil.getWhosTurnAtMoveIndex(boardsim, boardsim.state.local.moveIndex); // prettier-ignore

	// Stops stupid missing piece errors
	const indexToApply = boardsim.state.local.moveIndex + Number(!forward);
	if (indexToApply !== move.generateIndex)
		throw new Error(
			`Move was expected at index ${move.generateIndex} but applied at ${indexToApply} (forward: ${forward}).`,
		);

	applyEdit(boardsim, move, forward); // Apply the board changes
}

/**
 * Applies an edit's state and board changes to the boardsim.
 * @param boardsim - The boardsim to apply the edit to.
 * @param edit - The edit to apply, which contains the changes and state of the move.
 * @param forward - Whether the move's board changes should be applied forward or backward.
 */
function applyEdit(boardsim: Board, edit: Edit, forward: boolean): void {
	state.applyMove(boardsim.state, edit.state, forward); // Apply the State of the move
	boardchanges.runChanges(boardsim, edit.changes, boardchanges.changeFuncs, forward); // Logical board changes
}

/**
 * Tests if the boardsim is currently in check,
 * then creates and set's the game state to reflect that.
 */
function createCheckState(boardsim: Board, move: MoveFull): void {
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(
		boardsim,
		boardsim.state.local.moveIndex,
	);
	const oppositeColor = typeutil.invertPlayer(whosTurnItWasAtMoveIndex)!;
	// Only track checks if we're using checkmate win condition.
	const trackChecks = boardsim.gameRules.winConditions[oppositeColor]!.includes('checkmate');

	const checkResults = checkdetection.detectCheck(
		boardsim,
		whosTurnItWasAtMoveIndex,
		trackChecks,
	); // { check: boolean, royalsInCheck: Coords[], checks?: CheckInfo[] }
	const futureInCheck = checkResults.check === false ? false : checkResults.royalsInCheck;
	// Passing in the boardsim into this method tells state.ts to immediately apply the state change.
	state.createCheckState(move, boardsim.state.local.inCheck, futureInCheck, boardsim.state); // Passes in the boardsim as an argument
	state.createChecksState(
		move,
		boardsim.state.local.checks,
		checkResults.checks ?? [],
		boardsim.state,
	); // Erase the check pairs calculated from previous turn and pass in new ones
}

/**
 * Accepts a move list in the most comapact form: `['1,2>3,4','10,7>10,8Q']`,
 * reconstructs each move's properties, INCLUDING special tags, and makes that move
 * in the game. At each step it has to calculate what legal special
 * moves are possible, so it can pass on those flags.
 *
 * **THROWS AN ERROR** if any move during the process is in an invalid format.
 * @param boardsim - The boardsim
 * @param moves - The list of moves to add to the game, each in the most compact format: `['1,2>3,4','10,7>10,8Q']`
 * @param validateMoves - If true, throws an {@link IllegalMoveError} if any move is illegal.
 */
function makeAllMovesInGame(boardsim: Board, moves: MovePacket[], validateMoves?: boolean): void {
	if (boardsim.moves.length > 0)
		throw Error('Cannot make all moves in game when there are already moves played.');

	for (let i = 0; i < moves.length; i++) {
		const shortmove = moves[i]!;

		// If validateMoves flag is true, check if the move is actually legal!
		if (validateMoves) {
			const validationResult = movevalidation.isTokenMoveLegal(boardsim, shortmove.token);
			if (!validationResult.valid) {
				throw new IllegalMoveError(
					`Move ${i + 1} is illegal: ${shortmove.token}. Reason: ${validationResult.reason}`,
				);
			}
		}

		const move: MoveFull = calculateMoveFromPacket(boardsim, shortmove);
		makeMove(boardsim, move);

		// Also if validateMoves flag is true, any move that comes AFTER
		// when the game should have ended already is considered illegal!
		const isLastIteration = i === moves.length - 1;
		if (validateMoves && !isLastIteration) {
			const conclusion = wincondition.getGameConclusion(boardsim);
			if (conclusion)
				throw new IllegalMoveError(
					`Moves cannot come after game ends. Move ${i + 1} should have concluded game by ${JSON.stringify(conclusion)}.`,
				);
		}
	}
}

/**
 * Accepts a move in the most compact short form, and constructs the whole MoveFull object.
 * This has to calculate the piece's legal special
 * moves to be able to deduce if the move was a special move.
 *
 * **Returns undefined** if there was an error anywhere in the conversion.
 *
 * This does NOT perform legality checks, so still do that afterward.
 */
function calculateMoveFromPacket(boardsim: Board, movePacket: MovePacket): MoveFull {
	if (!moveutil.areWeViewingLatestMove(boardsim))
		throw Error(
			"Cannot calculate MoveFull object from shortmove when we're not viewing the most recently played move.",
		);

	// Reconstruct the startCoords, endCoords, and special move properties of the MoveTagged

	let moveTagged: MoveTagged;
	try {
		moveTagged = icnconverter.parseTokenMove(movePacket.token);
	} catch (error) {
		console.error(error);
		throw Error(
			`Failed to calculate Move from shortmove because it's in an incorrect format: ${movePacket.token}`,
		);
	}

	// Reconstruct the special move properties by calculating what legal
	// special moves this piece can make, comparing them to the move's endCoords,
	// and if there's a match, pass on the special move flag.

	const piece = boardutil.getPieceFromCoords(boardsim.pieces, moveTagged.startCoords);
	if (!piece) {
		// No piece on start coordinates, can't calculate Move, because it's illegal
		throw Error(`Failed to calculate Move from shortmove because there's no piece on the start coords: ${movePacket.token}`); // prettier-ignore
	}

	const moveset = legalmoves.getPieceMoveset(boardsim, piece.type);
	const legalSpecialMoves = legalmoves.getEmptyLegalMoves(moveset);
	legalmoves.appendSpecialMoves(boardsim, piece, moveset, legalSpecialMoves, false);
	for (const thisCoord of legalSpecialMoves.individual) {
		if (!coordutil.areCoordsEqual(thisCoord, moveTagged.endCoords)) continue;
		// Matched coordinates! Transfer any special move tags
		specialdetect.transferSpecialTags_FromCoordsToMove(thisCoord, moveTagged);
		break;
	}

	const move = generateMove(boardsim, moveTagged);
	if (movePacket.clockStamp !== undefined) move.clockStamp = movePacket.clockStamp;
	return move;
}

// Rewinding -------------------------------------------------------------------------------------------------------

/**
 * Executes all the logical board changes of a global REWIND move in the game, no graphical changes.
 */
function rewindMove(boardsim: Board): void {
	// console.error("Rewinding move");
	const move = moveutil.getMoveFromIndex(boardsim.moves, boardsim.state.local.moveIndex);

	applyMove(boardsim, move, false, true);

	// Delete the move off the end of our moves list
	boardsim.moves.pop();
}

// Dynamic -------------------------------------------------------------------------------------------------------

/**
 * Iterates to a certain move index, performing a callback function on each move.
 * @param callback - A move-application function run per ply, e.g. {@link applyMove} for
 * logical-only changes, or {@link movesequence.viewMove} that also makes graphical (mesh) changes.
 */
function goToMove(boardsim: Board, index: number, callback: (_move: MoveFull) => void): void {
	if (index === boardsim.state.local.moveIndex) return;

	const forwards = index >= boardsim.state.local.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = boardsim.state.local.moveIndex;

	if (boardsim.moves.length <= index + offset || index + offset < 0)
		throw Error('Target index is outside of the movelist!');

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

/**
 * UTILITY: Runs a specific action while the game is temporarily fast-forwarded
 * to the latest move. Afterwards restoring the game to its original state.
 * @returns The result of the action
 */
function runActionAtGameFront<T>(boardsim: Board, action: () => T): T {
	const originalMoveIndex = boardsim.state.local.moveIndex;

	// Fast Forward to the latest move (graphical updates skipped since we will return afterwards)
	goToMove(boardsim, boardsim.moves.length - 1, (move) => applyMove(boardsim, move, true, false));

	// Run the specific logic (move validation, conclusion check, etc)
	const result = action();

	// Rewind to original state
	goToMove(boardsim, originalMoveIndex, (move) => applyMove(boardsim, move, false, false));

	return result;
}

// Move Wrappers ----------------------------------------------------------------------------------------------------

/**
 * Simulates a move's board changes WITHOUT appending it to the move history, runs the callback,
 * then reverts. Unlike {@link simulateMoveWrapper} it never touches `moves` or `moveIndex`, so it
 * works at ANY ply — use it to observe board-state-only properties (e.g. check). It cannot observe
 * history-dependent properties (e.g. game conclusion).
 * @returns Whatever is returned by the callback
 */
function simulateEditWrapper<R>(boardsim: Board, moveTagged: MoveTagged, callback: () => R): R {
	const move = generateMove(boardsim, moveTagged);
	applyEdit(boardsim, move, true); // Apply the move's board & state changes (no history mutation)
	const info = callback();
	applyEdit(boardsim, move, false); // Revert
	return info;
}

/**
 * Wraps a callback in a simulated move, appending it to the move history for the duration.
 * Because it mutates `moves`/`moveIndex`, it ONLY works at the front of the game. Use it when
 * the callback reads move history (e.g. game conclusion); for board-state-only observations at
 * any ply, use {@link simulateEditWrapper}.
 * @returns Whatever is returned by the callback
 */
function simulateMoveWrapper<R>(boardsim: Board, moveTagged: MoveTagged, callback: () => R): R {
	generateAndMakeMove(boardsim, moveTagged);
	// What info can we pull from the game after simulating this move?
	const info = callback();
	rewindMove(boardsim);
	return info;
}

// ---------------------------------------------------------------------------------------------------------------------

export default {
	generateMove,
	calcMovesChanges,
	queueSpecialRightDeletionStateChanges,
	hasCastlingPartner,
	makeMove,
	generateAndMakeMove,
	goToMove,
	runActionAtGameFront,
	makeAllMovesInGame,
	applyMove,
	applyEdit,
	rewindMove,
	simulateEditWrapper,
	simulateMoveWrapper,
};
