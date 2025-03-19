
/** This script stores the default methods for EXECUTING special moves */

import boardutil from '../util/boardutil.js';
import boardchanges from './boardchanges.js';
import state from './state.js';

/** @typedef {import('./state.js').EnPassant} EnPassant */

"use strict";


// This returns the functions for executing special moves,
// it does NOT calculate if they're legal.
// In the future, parameters can be added if variants have
// different special moves for pieces.
const defaultSpecialMoves = {
	"kings": kings,
	"royalCentaurs": kings,
	"pawns": pawns,
	"roses": roses,
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
function kings(gamefile, piece, move) {

	const specialTag = move.castle; // { dir: -1/1, coord }
	if (!specialTag) return false; // No special move to execute, return false to signify we didn't move the piece.

	// Move the king to new square
	const moveChanges = move.changes;
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords); // Make normal move

	// Move the rook to new square

	const pieceToCastleWith = boardutil.getPieceFromCoords(gamefile.ourPieces, specialTag.coord);
	const landSquare = [move.endCoords[0] - specialTag.dir, move.endCoords[1]];
	boardchanges.queueMovePiece(moveChanges, false, pieceToCastleWith, landSquare); // Make normal move

	// Special move was executed!
	// (There is no captured piece with castling)
	return true; 
}

function pawns(gamefile, piece, move) {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (move.enpassantCreate !== undefined) state.createEnPassantState(move, gamefile.enpassant, move.enpassantCreate);

	const enpassantTag = move.enpassant; // true | undefined
	const promotionTag = move.promotion; // promote type
	if (!enpassantTag && !promotionTag) return false; ; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = enpassantTag ? gamefile.enpassant.pawn : move.endCoords;
	// const captureCoords = enpassantTag ? getEnpassantCaptureCoords(move.endCoords, enpassantTag) : move.endCoords;
	const capturedPiece = boardchanges.getPieceFromCoords(gamefile, captureCoords);

	// Delete the piece captured

	if (capturedPiece) {
		boardchanges.queueCapture(moveChanges, true, piece, move.endCoords, capturedPiece);
	} else {
		// Move the pawn
		boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords);
	}

	if (promotionTag) {
		// Delete original pawn
		boardchanges.queueDeletePiece(moveChanges, true, {coords: move.endCoords, type: piece.type, index: piece.index});

		boardchanges.queueAddPiece(moveChanges, {coords: move.endCoords, type: promotionTag, index: -1});
	}

	// Special move was executed!
	return true;
}

// The Roses need a custom special move function so that it can pass the `path` special flag to the move changes.
function roses(gamefile, piece, move) {
	const capturedPiece = boardutil.getPieceFromCoords(gamefile.ourPieces, move.endCoords);

	// Delete the piece captured
	if (capturedPiece !== undefined) boardchanges.queueCapture(move.changes, true, piece, move.endCoords, capturedPiece, move.path);
	else boardchanges.queueMovePiece(move.changes, true, piece, move.endCoords, move.path);

	// Special move was executed!
	return true;
}



/**
 * Returns the coordinate distances certain piece types have a chance
 * of special-move capturing on, according to the default specialMove functions.
 */
function getDefaultSpecialVicinitiesByPiece() {
	return {
		// "kings": [], // Impossible for kings to make a capture while castling
		// "royalCentaurs": [], // Same for royal centaurs
		"pawns": [[-1,1],[1,1],[-1,-1],[1,-1]], // All squares a pawn could potentially capture on.
		// All squares a rose piece could potentially capture on.
		"roses": [[-2,-1],[-3,-3],[-2,-5],[0,-6],[2,-5],[3,-3],[2,-1],[-4,0],[-5,2],[-4,4],[-2,5],[0,4],[1,2],[-1,-2],[0,-4],[4,-4],[5,-2],[4,0],[2,1],[-5,-2],[-6,0],[-3,3],[-1,2],[1,-2],[6,0],[5,2],[3,3],[-4,-4],[-2,1],[4,4],[2,5],[0,6]],
	};
}



export default {
	defaultSpecialMoves,
	getDefaultSpecialVicinitiesByPiece,
};	