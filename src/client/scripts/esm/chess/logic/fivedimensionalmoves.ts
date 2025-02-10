'use strict';

import colorutil from "../util/colorutil.js";
import coordutil from "../util/coordutil.js";
import gamefileutility from "../util/gamefileutility.js";
import boardchanges, { Piece } from "./boardchanges.js";
// Import Start
// @ts-ignore
import gamefile from "./gamefile.js";
import { Move } from "./movepiece.js";
import { Coords } from "./movesets.js";
import state from "./state.js";
import math from "../../util/math.js";
// Import End

// Coordinates in the form [x, y, boardX, boardY]
type FiveDimensionalCoords = [number, number, number, number];

function TwoDToFiveDCoords(coords: Coords): FiveDimensionalCoords {
	return [math.posMod(coords[0], 10), math.posMod(coords[1], 10), Math.floor(coords[0] / 10), Math.floor(coords[1] / 10)];
}

function FiveDToTwoDCoords(coords: FiveDimensionalCoords): Coords {
	return [coords[0] + coords[2] * 10, coords[1] + coords[3] * 10];
}

function fivedimensionalpawnmove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const fiveDCoords = TwoDToFiveDCoords(coords);
	const legalMoves: FiveDimensionalCoords[] = [];
	let legalSpacelike: Coords[] = [];
	let legalTimelike: Coords[] = [];
	legalSpacelike = pawnLegalMoves(gamefile, coords, color, 1);
	legalTimelike = pawnLegalMoves(gamefile, coords, color, 10);
	for (const coord of legalSpacelike) {
		legalMoves.push(TwoDToFiveDCoords(coord));
	}
	for (const coord of legalTimelike) {
		legalMoves.push(TwoDToFiveDCoords(coord));
	}
	console.log(legalMoves);
	return legalMoves.map(value => FiveDToTwoDCoords(value));
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
	// addPossibleTimelikeEnPassant(gamefile, individualMoves, coords, color);
	return individualMoves;
}

function addPossibleTimelikeEnPassant(gamefile: gamefile, individualMoves: Coords[], coords: Coords, color: string) {
	if (!gamefile.enpassant) return; // No enpassant flag on the game, no enpassant possible

	const xLandDiff = gamefile.enpassant[0] - coords[0];
	const oneOrNegOne = color === 'white' ? 10 : -10;
	if (Math.abs(xLandDiff) !== 1) return; // Not immediately left or right of us
	if (coords[1] + oneOrNegOne !== gamefile.enpassant[1]) return; // Not one in front of us

	const captureSquare: Coords = [coords[0] + xLandDiff, coords[1] + oneOrNegOne];

	const capturedPieceSquare = [coords[0] + xLandDiff, coords[1]] as Coords;
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
	// captureSquare["enpassant"] = -oneOrNegOne / 10;
	individualMoves.push(captureSquare);
}

function doFiveDimensionalPawnMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;
	const enpassantTag: number | undefined = move.enpassant;
	let captureOffset: number;
	if (!enpassantTag) {
		captureOffset = 0;
	} else {
		captureOffset = enpassantTag * 10;
	}

	if (Math.abs(move.endCoords[1] - piece.coords[1]) === 20) {
		state.createState(move, 'enpassant', gamefile.enpassant, [piece.coords[1], (piece.coords[1] + move.endCoords[1]) / 2]);
	}

	if (!enpassantTag) {
		return false;
	}

	const pieceToCapture = gamefileutility.getPieceAtCoords(gamefile, [move.endCoords[0], move.endCoords[1] + captureOffset]);
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