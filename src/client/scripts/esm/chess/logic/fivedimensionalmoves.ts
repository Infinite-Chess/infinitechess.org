'use strict';

import colorutil from "../util/colorutil.js";
import coordutil from "../util/coordutil.js";
import gamefileutility from "../util/gamefileutility.js";
import boardchanges, { Piece } from "./boardchanges.js";
// Import Start
// @ts-ignore
import gamefile from "./gamefile.js";
import { CoordsSpecial, Move } from "./movepiece.js";
import { Coords } from "./movesets.js";
import state from "./state.js";
// Import End

function fivedimensionalpawnmove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const legalMoves: Coords[] = [];
	let legalSpacelike: Coords[] = [];
	let legalTimelike: Coords[] = [];
	legalSpacelike = pawnLegalMoves(gamefile, coords, color, 1);
	legalTimelike = pawnLegalMoves(gamefile, coords, color, 10);
	for (const coord of legalSpacelike) {
		legalMoves.push(coord);
	}
	for (const coord of legalTimelike) {
		legalMoves.push(coord);
	}
	console.log(legalMoves);
	return legalMoves;
}

function doesPieceHaveSpecialRight(gamefile: gamefile, coords: Coords) {
	const key = coordutil.getKeyFromCoords(coords);
	return gamefile.specialRights[key];
}

function pawnLegalMoves(gamefile: gamefile, coords: Coords, color: string, distance: number): Coords[] {

	// White and black pawns move and capture in opposite directions.
	const yOneorNegOne = color === 'white' ? distance : -distance;
	const individualMoves: Coords[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it?
	const coordsInFront = [coords[0], coords[1] + yOneorNegOne] as Coords;
	if (!gamefileutility.getPieceTypeAtCoords(gamefile, coordsInFront)) {
		individualMoves.push(coordsInFront); // No piece, add the move

		// Is the double push legal?
		const doublePushCoord = [coordsInFront[0], coordsInFront[1] + yOneorNegOne] as Coords;
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, doublePushCoord);
		if (!pieceAtCoords && doesPieceHaveSpecialRight(gamefile, coords)) individualMoves.push(doublePushCoord); // Add the double push!
	}

	// 2. It can capture diagonally if there are opponent pieces there

	const coordsToCapture: Coords[] = [
		[coords[0] - distance, coords[1] + yOneorNegOne],
		[coords[0] + distance, coords[1] + yOneorNegOne]
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

		individualMoves.push(thisCoordsToCapture); // Good to add the capture!
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	addPossibleEnPassant(gamefile, individualMoves, coords, color, distance);
	return individualMoves;
}

function addPossibleEnPassant(gamefile: gamefile, individualMoves: Coords[], coords: Coords, color: string, distance: number) {
	if (!gamefile.enpassant) return; // No enpassant flag on the game, no enpassant possible

	const xLandDiff = gamefile.enpassant.square[0] - coords[0];
	const oneOrNegOne = color === 'white' ? distance : -distance;
	if (Math.abs(xLandDiff) !== 1 && Math.abs(xLandDiff) !== 10) return; // Not immediately left or right of us
	if (coords[1] + oneOrNegOne !== gamefile.enpassant.square[1]) return; // Not one in front of us

	const captureSquare: CoordsSpecial = [coords[0] + xLandDiff, coords[1] + oneOrNegOne];

	const capturedPieceSquare = gamefile.enpassant.pawn;
	const capturedPieceType = gamefileutility.getPieceTypeAtCoords(gamefile, capturedPieceSquare);
	// cannot capture nothing en passant
	if (!capturedPieceType) return;
	// cannot capture own piece en passant
	if (color === colorutil.getPieceColorFromType(capturedPieceType)) return;

	// It is capturable en passant!

	// Extra check to make sure there's no piece (bug if so)
	if (gamefileutility.getPieceTypeAtCoords(gamefile, captureSquare)) return console.error("We cannot capture onpassant onto a square with an existing piece! " + captureSquare);

	// TAG THIS MOVE as an en passant capture!! gamefile looks for this tag
	// on the individual move to detect en passant captures and to know what piece to delete
	captureSquare.enpassant = true;
	individualMoves.push(captureSquare);
}

function doFiveDimensionalPawnMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;
	const enpassantTag: true | undefined = move.enpassant;
	let distance: number;
	{
		if (move.endCoords[0] === piece.coords[0]) {
			// Piece moved forwards
			distance = Math.abs(move.endCoords[1] - piece.coords[1]) === 1 || Math.abs(move.endCoords[1] - piece.coords[1]) === 2 ? 1 : 10;
		} else {
			distance = Math.abs(move.endCoords[0] - piece.coords[0]);
		}
	}

	if (Math.abs(move.endCoords[1] - piece.coords[1]) === 2 * distance) {
		state.createEnPassantState(move, gamefile.enpassant, { pawn: move.endCoords, square: [piece.coords[0], (piece.coords[1] + move.endCoords[1]) / 2] });
	}

	if (!enpassantTag) {
		return false;
	}

	const pieceToCapture = gamefileutility.getPieceAtCoords(gamefile, gamefile.enpassant?.pawn!);
	if (pieceToCapture) {
		boardchanges.queueCapture(moveChanges, piece, true, move.endCoords, pieceToCapture);
		return true;
	}
	return false;
}

function equals(a: Object, b: Object): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export default {
	fivedimensionalpawnmove,
	doFiveDimensionalPawnMove
};