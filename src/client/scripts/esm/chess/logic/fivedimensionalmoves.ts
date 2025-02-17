
/**
 * This script both calculates the legal moves of
 * pieces in the five dimensional variant and executes them.
 */


import type { Piece } from "./boardchanges.js";
import type { CoordsSpecial, Move } from "./movepiece.js";
import type { Coords } from "./movesets.js";


import colorutil from "../util/colorutil.js";
import coordutil from "../util/coordutil.js";
import gamefileutility from "../util/gamefileutility.js";
import boardchanges from "./boardchanges.js";
import state from "./state.js";
// @ts-ignore
import gamefile from "./gamefile.js";


// Legal Move Calculation -----------------------------------------------------------------


/** Calculates the legal pawn moves in the five dimensional variant. */
function fivedimensionalpawnmove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const legalMoves: Coords[] = [];
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, 1)); // Spacelike
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, 10)); // Timelike
	return legalMoves;
}

function doesPieceHaveSpecialRight(gamefile: gamefile, coords: Coords) {
	const key = coordutil.getKeyFromCoords(coords);
	return gamefile.specialRights[key];
}

/**
 * Calculates legal pawn moves for either the spacelike or timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param distance - 1 for spacelike, 10 for timelike
 */
function pawnLegalMoves(gamefile: gamefile, coords: Coords, color: string, distance: 1 | 10): Coords[] {

	// White and black pawns move and capture in opposite directions.
	const yDistanceParity = color === 'white' ? distance : -distance;
	const individualMoves: Coords[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it?
	const coordsInFront = [coords[0], coords[1] + yDistanceParity] as Coords;
	if (gamefileutility.getPieceTypeAtCoords(gamefile, coordsInFront) === undefined) {
		appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, coordsInFront, color); // No piece, add the move
		// Is the double push legal?
		const doublePushCoord = [coordsInFront[0], coordsInFront[1] + yDistanceParity] as Coords;
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, doublePushCoord);
		if (pieceAtCoords === undefined && doesPieceHaveSpecialRight(gamefile, coords)) appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, doublePushCoord, color); // Add the double push!
	}

	// 2. It can capture diagonally if there are opponent pieces there

	const coordsToCapture: Coords[] = [
		[coords[0] - distance, coords[1] + yDistanceParity],
		[coords[0] + distance, coords[1] + yDistanceParity]
	];
	for (let i = 0; i < 2; i++) {
		const thisCoordsToCapture = coordsToCapture[i]!;

		// Is there an enemy piece at this coords?
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, thisCoordsToCapture);
		if (!pieceAtCoords) continue; // No piece, skip

		// There is a piece. Make sure it's a different color
		const colorOfPiece = colorutil.getPieceColorFromType(pieceAtCoords);
		if (color === colorOfPiece) continue; // Same color, don't add the capture

		// Make sure it isn't a void
		if (pieceAtCoords === 'voidsN') continue;

		appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, thisCoordsToCapture, color); // Add the capture
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	addPossibleEnPassant(gamefile, individualMoves, coords, color, distance);
	return individualMoves;
}

/**
 * Adds the en passant capture to the list of individual moves if it is possible.
 * @param gamefile 
 * @param individualMoves - The list of individual moves to add the en passant capture to
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param distance - 1 for spacelike, 10 for timelike
 */
function addPossibleEnPassant(gamefile: gamefile, individualMoves: Coords[], coords: Coords, color: string, distance: number): void {
	if (!gamefile.enpassant) return; // No enpassant flag on the game, no enpassant possible

	const xDifference = gamefile.enpassant.square[0] - coords[0];
	if (Math.abs(xDifference) !== distance) return; // Not immediately left or right of us
	const yDistanceParity = color === 'white' ? distance : -distance;
	if (coords[1] + yDistanceParity !== gamefile.enpassant.square[1]) return; // Not one in front of us

	// It is capturable en passant!

	/** The square the pawn lands on. */
	const enPassantSquare: CoordsSpecial = coordutil.copyCoords(gamefile.enpassant.square);

	// TAG THIS MOVE as an en passant capture!! gamefile looks for this tag
	// on the individual move to detect en passant captures and to know what piece to delete
	enPassantSquare.enpassant = true;
	appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, enPassantSquare, color);
}

/**
 * Appends the provided move to the running individual moves list,
 * and adds the `promoteTrigger` special flag to it if it landed on a promotion rank.
 */
function appendPawnMoveAndAttachPromoteFlag(gamefile: gamefile, individualMoves: CoordsSpecial[], landCoords: CoordsSpecial, color: string) {
	if (gamefile.gameRules.promotionRanks !== undefined) {
		const teamPromotionRanks = gamefile.gameRules.promotionRanks[color];
		if (teamPromotionRanks.includes(landCoords[1])) landCoords.promoteTrigger = true;
	}

	individualMoves.push(landCoords);
}


// Move Execution ----------------------------------------------------------------------


/** Executes a five dimensional pawn move.  */
function doFiveDimensionalPawnMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;
	let distance: 1 | 10;

	const absXDistance = Math.abs(move.endCoords[0] - piece.coords[0]);
	const absYDistance = Math.abs(move.endCoords[1] - piece.coords[1]);

	// Piece moved forwards
	if (absXDistance === 0) distance = absYDistance <= 2 ? 1 : 10;
	else distance = absXDistance as 1 | 10;

	if (absYDistance === 2 * distance) { // Double pushed either spacelike or timelike. Create the en passant state
		const newEnPassantSquare: Coords = [piece.coords[0], (piece.coords[1] + move.endCoords[1]) / 2] as Coords;
		state.createEnPassantState(move, gamefile.enpassant, { square: newEnPassantSquare, pawn: move.endCoords });
	}

	if (!move.enpassant && !move.promotion) return false; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = move.enpassant ? gamefile.enpassant!.pawn : move.endCoords;
	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, captureCoords);

	if (capturedPiece) boardchanges.queueCapture(moveChanges, piece, true, move.endCoords, capturedPiece); // Delete the piece captured
	else boardchanges.queueMovePiece(moveChanges, piece, true, move.endCoords); // Move the pawn

	if (move.promotion) { // Handle promotion special move
		boardchanges.queueDeletePiece(moveChanges, { type: piece.type, coords: move.endCoords, index: piece.index }, true); // Delete original pawn
		boardchanges.queueAddPiece(moveChanges, { type: move.promotion, coords: move.endCoords } as Piece); // Add promoted piece
	}

	return true; // Special move was executed!
}


// Exports ---------------------------------------------------------------------


export default {
	fivedimensionalpawnmove,
	doFiveDimensionalPawnMove
};