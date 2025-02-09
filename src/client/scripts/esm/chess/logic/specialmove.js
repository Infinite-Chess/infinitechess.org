
/** This script stores the default methods for EXECUTING special moves */

import gamefileutility from '../util/gamefileutility.js';
import boardchanges from './boardchanges.js';
import coordutil from '../util/coordutil.js';
import state from './state.js';

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
	boardchanges.queueMovePiece(moveChanges, piece, true, move.endCoords); // Make normal move

	// Move the rook to new square

	const pieceToCastleWith = gamefileutility.getPieceAtCoords(gamefile, specialTag.coord);
	const landSquare = [move.endCoords[0] - specialTag.dir, move.endCoords[1]];
	// Delete the rook's special move rights
	const key = coordutil.getKeyFromCoords(pieceToCastleWith.coords);
	state.createState(move, 'specialrights', gamefile.specialRights[key], undefined, { coordsKey: key });

	boardchanges.queueMovePiece(moveChanges, pieceToCastleWith, false, landSquare); // Make normal move

	// Special move was executed!
	// There is no captured piece with castling
	return true;
}

function pawns(gamefile, piece, move) {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (isPawnMoveADoublePush(piece.coords, move.endCoords)) {
		state.createState(move, 'enpassant', gamefile.enpassant, getEnPassantSquare(piece.coords, move.endCoords));
	}

	const enpassantTag = move.enpassant; // -1/1
	const promotionTag = move.promotion; // promote type
	if (!enpassantTag && !promotionTag) return false; ; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = enpassantTag ? getEnpassantCaptureCoords(move.endCoords, enpassantTag) : move.endCoords;
	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, captureCoords);

	// Delete the piece captured

	if (capturedPiece) {
		boardchanges.queueCapture(moveChanges, piece, true, move.endCoords, capturedPiece);
	} else {
		// Move the pawn
		boardchanges.queueMovePiece(moveChanges, piece, true, move.endCoords);
	}

	if (promotionTag) {
		// Delete original pawn
		boardchanges.queueDeletePiece(moveChanges, { type: piece.type, coords: move.endCoords, index: piece.index }, true);

		boardchanges.queueAddPiece(moveChanges, { type: promotionTag, coords: move.endCoords, index: undefined });
	}

	// Special move was executed!
	return true;
}

function isPawnMoveADoublePush(pawnCoords, endCoords) { return Math.abs(pawnCoords[1] - endCoords[1]) === 2; }

/**
 * Returns the en passant square of a pawn double push move
 * @param {number[]} moveStartCoords - The start coordinates of the move
 * @param {number[]} moveEndCoords - The end coordinates of the move
 * @returns {number[]} The coordinates en passant is allowed
 */
function getEnPassantSquare(moveStartCoords, moveEndCoords) {
	const y = (moveStartCoords[1] + moveEndCoords[1]) / 2;
	return [moveStartCoords[0], y];
}

// MUST require there be an enpassant tag!
function getEnpassantCaptureCoords(endCoords, enpassantTag) { return [endCoords[0], endCoords[1] + enpassantTag]; }

// The Roses need a custom special move function so that it can pass the `path` special flag to the move changes.
function roses(gamefile, piece, move) {
	if (move.path === undefined) throw Error('Roses move object must have the path special flag to execute the move!');

	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);

	// Delete the piece captured
	if (capturedPiece !== undefined) boardchanges.queueCapture(move.changes, piece, true, move.endCoords, capturedPiece, move.path);
	else boardchanges.queueMovePiece(move.changes, piece, true, move.endCoords, move.path);

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