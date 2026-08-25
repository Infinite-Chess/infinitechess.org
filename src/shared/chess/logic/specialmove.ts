// src/shared/chess/logic/specialmove.ts

/** This script stores the default methods for EXECUTING special moves */

import type { Piece } from './boardutil.js';
import type { Board } from './boardinit.js';
import type { Coords } from '../../util/coordutil.js';
import type { RawTypeGroup } from '../../util/typeutil.js';
import type { Edit, MoveTagged } from './movepiece.js';

import state from './state.js';
import boardutil from './boardutil.js';
import boardchanges from './boardchanges.js';
import { rawTypes as r } from '../../util/typeutil.js';

// Types -----------------------------------------------------------------------

/**
 * Function that queues all of the changes a special move makes when executed.
 */
export type SpecialMoveFunction = (boardsim: Board, piece: Piece, move: MoveRunning) => boolean;

/** All properties of the Move that special move functions need to access */
export interface MoveRunning extends MoveTagged, Edit {}

/**
 * An object storing the squares in the immediate vicinity
 * a piece has a CHANCE of making a special-move capture from.
 *
 * The value is a list of coordinates that it may be possible for that raw piece type to make a special capture from that distance.
 */
export type SpecialVicinity = RawTypeGroup<Coords[]>;

// Constants -------------------------------------------------------------------

/**
 * The function that EXECUTES each piece type's special move. These do NOT calculate
 * whether the move is legal — that is specialdetect's job.
 *
 * Each returns false when the move it was handed isn't its special move after all,
 * so the caller falls back to moving the piece normally.
 */
const DEFAULT_SPECIAL_MOVES: RawTypeGroup<SpecialMoveFunction> = {
	[r.KING]: kings,
	[r.ROYALCENTAUR]: kings,
	[r.PAWN]: pawns,
	[r.ROSE]: roses,
};

// Special Move Functions ------------------------------------------------------

/*
 * A custom special move needs to be able to:
 * * Delete a custom piece
 * * Move a custom piece
 * * Add a custom piece
 *
 * ALL FUNCTIONS NEED TO:
 * * Make the move
 * * Append the move
 */

/** Executes castling, when the king's move carries a `castle` tag. */
function kings(boardsim: Board, piece: Piece, move: MoveRunning): boolean {
	const specialTag = move.castle; // { dir: -1/1, coord }
	if (!specialTag) return false; // No special move to execute, return false to signify we didn't move the piece.

	// Move the king to new square
	const moveChanges = move.changes;
	const kingCapturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, move.endCoords);
	// CASTLING CAN CAPTURE A PIECE IF IT'S A PREMOVE!!!
	if (kingCapturedPiece) boardchanges.queueCapture(moveChanges, true, kingCapturedPiece); // Capture piece
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords);

	// Move the rook to new square
	const pieceToCastleWith = boardutil.getPieceFromCoords(boardsim.pieces, specialTag.coord)!;
	const landSquare: Coords = [move.endCoords[0] - specialTag.dir, move.endCoords[1]];
	const rookCapturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, landSquare);
	// CASTLING CAN CAPTURE A PIECE IF IT'S A PREMOVE!!!
	if (rookCapturedPiece) boardchanges.queueCapture(moveChanges, false, rookCapturedPiece); // Capture piece
	boardchanges.queueMovePiece(moveChanges, false, pieceToCastleWith, landSquare);

	// Special move was executed!
	// (There is no captured piece with castling)
	return true;
}

/** Executes a pawn's en passant capture and/or promotion, and records a new en passant square. */
function pawns(boardsim: Board, piece: Piece, move: MoveRunning): boolean {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (move.enpassantCreate !== undefined)
		state.createEnPassantState(move, boardsim.state.global.enpassant, move.enpassantCreate);

	const enpassantTag = move.enpassant; // true | undefined
	const promotionTag = move.promotion; // promote type
	if (!enpassantTag && !promotionTag) return false; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = enpassantTag ? boardsim.state.global.enpassant!.pawn : move.endCoords;
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, captureCoords);

	// Delete the piece captured

	if (capturedPiece) boardchanges.queueCapture(moveChanges, true, capturedPiece);
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords);

	if (promotionTag) {
		// Delete original pawn
		boardchanges.queueDeletePiece(moveChanges, true, {
			coords: move.endCoords,
			type: piece.type,
			index: piece.index,
		});

		boardchanges.queueAddPiece(moveChanges, {
			coords: move.endCoords,
			type: promotionTag,
			index: -1,
		});
	}

	// Special move was executed!
	return true;
}

/** Moves a rose. Custom so that it can pass the `path` special flag onto the move changes. */
function roses(boardsim: Board, piece: Piece, move: MoveRunning): boolean {
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, move.endCoords);

	// Delete the piece captured
	if (capturedPiece) boardchanges.queueCapture(move.changes, true, capturedPiece);
	boardchanges.queueMovePiece(move.changes, true, piece, move.endCoords, move.path);

	// Special move was executed!
	return true;
}

// Special Vicinities ----------------------------------------------------------

/**
 * Returns the coordinate distances certain piece types have a chance
 * of special-move capturing on, according to the default specialMove functions.
 */
function getDefaultSpecialVicinitiesByPiece(): SpecialVicinity {
	// prettier-ignore
	return {
		[r.PAWN]: [[-1n,1n],[1n,1n],[-1n,-1n],[1n,-1n]], // All squares a pawn could potentially capture on.
		// All squares a rose piece could potentially capture on.
		[r.ROSE]: [[-2n,-1n],[-3n,-3n],[-2n,-5n],[0n,-6n],[2n,-5n],[3n,-3n],[2n,-1n],[-4n,0n],[-5n,2n],[-4n,4n],[-2n,5n],[0n,4n],[1n,2n],[-1n,-2n],[0n,-4n],[4n,-4n],[5n,-2n],[4n,0n],[2n,1n],[-5n,-2n],[-6n,0n],[-3n,3n],[-1n,2n],[1n,-2n],[6n,0n],[5n,2n],[3n,3n],[-4n,-4n],[-2n,1n],[4n,4n],[2n,5n],[0n,6n]],
	};
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	DEFAULT_SPECIAL_MOVES,
	// Special Vicinities
	getDefaultSpecialVicinitiesByPiece,
};
