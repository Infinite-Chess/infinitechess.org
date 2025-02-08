// Import Start
import gamefileutility from '../util/gamefileutility.js';
import boardchanges from './boardchanges.js';
import coordutil from '../util/coordutil.js';
import state from './state.js';
// Import End

"use strict";

/** This script returns the functions for EXECUTING special moves */

// This returns the functions for executing special moves,
// it does NOT calculate if they're legal.
// In the future, parameters can be added if variants have
// different special moves for pieces.
const defaultSpecialMoves = {
	"kings": kings,
	"royalCentaurs": kings,
	"pawns": pawns
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

	if (capturedPiece) move.captured = capturedPiece.type;

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



/**
 * Reflection of legalmoves.genVicinity()
 * 
 * Calculates the area around you in which special pieces HAVE A CHANCE to capture you from that distance.
 * This is used for efficient calculating if a move would put you in check by a special piece.
 * If a special piece is found at any of these distances, their legal moves are calculated
 * to see if they would check you or not.
 * This saves us from having to iterate through every single
 * special piece in the game to see if they would check you.
 * 
 * @returns {Object} The specialVicinity object, in the format: `{ '1,1': ['pawns'], '1,2': ['roses'], ... }`
 */
function genSpecialVicinity(specialVicinityByPiece) {
	const vicinity = {};

	for (const [type, pieceVicinity] of Object.entries(specialVicinityByPiece)) {
		pieceVicinity.forEach(coords => {
			const coordsKey = coordutil.getKeyFromCoords(coords);
			vicinity[coordsKey] = vicinity[coordsKey] ?? []; // Make sure its initialized
			vicinity[coordsKey].push(type);
		});
	}

	// console.log("Calculated special vicinity:");
	// console.log(vicinity);

	return vicinity;
}



export default {
	defaultSpecialMoves,
	genSpecialVicinity
};