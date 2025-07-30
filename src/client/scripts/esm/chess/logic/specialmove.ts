
/** This script stores the default methods for EXECUTING special moves */

import boardutil from '../util/boardutil.js';
import boardchanges from './boardchanges.js';
import state from './state.js';
import { rawTypes } from '../util/typeutil.js';

import type { RawTypeGroup } from '../util/typeutil.js';
import type { Coords } from '../util/coordutil.js';
import type { Edit, MoveDraft } from './movepiece.js';
import type { Piece } from '../util/boardutil.js';
import type { Board } from './gamefile.js';

"use strict";


/**
 * Function that queues all of the changes a special move makes when executed.
 */
// eslint-disable-next-line no-unused-vars
type SpecialMoveFunction = (boardsim: Board, piece: Piece, move: MoveDraftEdit, skip_state_changes?: boolean) => boolean;

/** All properties of the Move that special move functions need to access */
interface MoveDraftEdit extends MoveDraft, Edit {}

/**
 * An object storing the squares in the immediate vicinity
 * a piece has a CHANCE of making a special-move capture from.
 * 
 * The value is a list of coordinates that it may be possible for that raw piece type to make a special capture from that distance.
 */
type SpecialVicinity = RawTypeGroup<Coords[]>

// This returns the functions for executing special moves,
// it does NOT calculate if they're legal.
// In the future, parameters can be added if variants have
// different special moves for pieces.
const defaultSpecialMoves: RawTypeGroup<SpecialMoveFunction> = {
	[rawTypes.KING]: kings,
	[rawTypes.ROYALCENTAUR]: kings,
	[rawTypes.PAWN]: pawns,
	[rawTypes.ROSE]: roses,
};

// A custom special move needs to be able to:
// * Delete a custom piece
// * Move a custom piece
// * Add a custom piece


// ALL FUNCTIONS NEED TO:
// * Make the move
// * Append the move


// Called when the piece moved is a king.
// Tests if the move contains "castle" special move, if so it executes it!
// RETURNS FALSE if special move was not executed!
function kings(boardsim: Board, piece: Piece, move: MoveDraftEdit) {

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

function pawns(boardsim: Board, piece: Piece, move: MoveDraftEdit, skip_state_changes = false) {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (move.enpassantCreate !== undefined && !skip_state_changes) state.createEnPassantState(move, boardsim.state.global.enpassant, move.enpassantCreate);

	const enpassantTag = move.enpassant; // true | undefined
	const promotionTag = move.promotion; // promote type
	if (!enpassantTag && !promotionTag) return false; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = enpassantTag ? boardsim.state.global.enpassant!.pawn : move.endCoords;
	// const captureCoords = enpassantTag ? getEnpassantCaptureCoords(move.endCoords, enpassantTag) : move.endCoords;
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, captureCoords);

	// Delete the piece captured

	if (capturedPiece) boardchanges.queueCapture(moveChanges, true, capturedPiece);
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords);

	if (promotionTag) {
		// Delete original pawn
		boardchanges.queueDeletePiece(moveChanges, true, { coords: move.endCoords, type: piece.type, index: piece.index });

		boardchanges.queueAddPiece(moveChanges, { coords: move.endCoords, type: promotionTag, index: -1 });
	}

	// Special move was executed!
	return true;
}

// The Roses need a custom special move function so that it can pass the `path` special flag to the move changes.
function roses(boardsim: Board, piece: Piece, move: MoveDraftEdit) {
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, move.endCoords);

	// Delete the piece captured
	if (capturedPiece) boardchanges.queueCapture(move.changes, true, capturedPiece);
	boardchanges.queueMovePiece(move.changes, true, piece, move.endCoords, move.path);

	// Special move was executed!
	return true;
}



/**
 * Returns the coordinate distances certain piece types have a chance
 * of special-move capturing on, according to the default specialMove functions.
 */
function getDefaultSpecialVicinitiesByPiece(): SpecialVicinity {
	return {
		[rawTypes.PAWN]: [[-1,1],[1,1],[-1,-1],[1,-1]], // All squares a pawn could potentially capture on.
		// All squares a rose piece could potentially capture on.
		[rawTypes.ROSE]: [[-2,-1],[-3,-3],[-2,-5],[0,-6],[2,-5],[3,-3],[2,-1],[-4,0],[-5,2],[-4,4],[-2,5],[0,4],[1,2],[-1,-2],[0,-4],[4,-4],[5,-2],[4,0],[2,1],[-5,-2],[-6,0],[-3,3],[-1,2],[1,-2],[6,0],[5,2],[3,3],[-4,-4],[-2,1],[4,4],[2,5],[0,6]],
	};
}

export default {
	defaultSpecialMoves,
	getDefaultSpecialVicinitiesByPiece,
};	

export type {
	MoveDraftEdit,
	SpecialMoveFunction,
	SpecialVicinity,
};