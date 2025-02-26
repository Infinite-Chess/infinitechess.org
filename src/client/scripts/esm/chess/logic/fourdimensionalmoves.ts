/* eslint-disable max-depth */

/**
 * This script both calculates the legal moves of
 * pieces in the four dimensional variant and executes them.
 */


import type { Piece } from "./boardchanges.js";
import type { CoordsSpecial, Move } from "./movepiece.js";
import type { Coords } from "./movesets.js";


import colorutil from "../util/colorutil.js";
import coordutil from "../util/coordutil.js";
import gamefileutility from "../util/gamefileutility.js";
import boardchanges from "./boardchanges.js";
import fivedimensionalgenerator from "../variants/fourdimensionalgenerator.js";
import state from "./state.js";
// @ts-ignore
import gamefile from "./gamefile.js";
// @ts-ignore
import specialdetect from "./specialdetect.js";


// Pawn Legal Move Calculation and Execution -----------------------------------------------------------------

/** Calculates the legal pawn moves in the four dimensional variant. */
function fourDimensionalPawnMove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const legalMoves: Coords[] = [];
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, "spacelike")); // Spacelike
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, "timelike")); // Timelike
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
 * @param movetype - spacelike move or timelike move
 */
function pawnLegalMoves(gamefile: gamefile, coords: Coords, color: string, movetype: "spacelike" | "timelike"): Coords[] {
	const dim = fivedimensionalgenerator.get4DBoardDimensions();
	const distance = (movetype === "spacelike" ? 1 : dim.BOARD_SPACING);
	
	// White and black pawns move and capture in opposite directions.
	const yDistanceParity = color === 'white' ? distance : -distance;
	const individualMoves: Coords[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it? And do not allow pawn to leave the 4D board
	const coordsInFront = [coords[0], coords[1] + yDistanceParity] as Coords;
	if (gamefileutility.getPieceTypeAtCoords(gamefile, coordsInFront) === undefined &&
		coordsInFront[0] > dim.MIN_X && coordsInFront[0] < dim.MAX_X && coordsInFront[1] > dim.MIN_Y && coordsInFront[1] < dim.MAX_Y) {
		appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, coordsInFront, color); // No piece, add the move
		// Is the double push legal?
		const doublePushCoord = [coordsInFront[0], coordsInFront[1] + yDistanceParity] as CoordsSpecial;
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, doublePushCoord);
		if (pieceAtCoords === undefined && doesPieceHaveSpecialRight(gamefile, coords)) { // Add the double push!
			doublePushCoord.enpassantCreate = specialdetect.getEnPassantGamefileProperty(coords, doublePushCoord);
			appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, doublePushCoord, color); // Add the double push!
		}
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
		if (pieceAtCoords.startsWith('voids')) continue;

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
 * @param distance - 1 for spacelike, dim.BOARD_SPACING for timelike
 */
function addPossibleEnPassant(gamefile: gamefile, individualMoves: Coords[], coords: Coords, color: string, distance: number): void {
	if (!gamefile.enpassant) return; // No enpassant flag on the game, no enpassant possible
	if (color !== gamefile.whosTurn) return; // Not our turn (the only color who can legally capture enpassant is whos turn it is). If it IS our turn, this also guarantees the captured pawn will be an enemy pawn.
	const enpassantCapturedPawn = gamefileutility.getPieceTypeAtCoords(gamefile, gamefile.enpassant.pawn)!;
	if (colorutil.getPieceColorFromType(enpassantCapturedPawn) === color) return; // The captured pawn is not an enemy pawn. THIS IS ONLY EVER NEEDED if we can move opponent pieces on our turn, which is the case in EDIT MODE.

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

/** Executes a four dimensional pawn move.  */
function doFourDimensionalPawnMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (move.enpassantCreate !== undefined) state.createEnPassantState(move, gamefile.enpassant, move.enpassantCreate);

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


// Knight Legal Move Calculation and Execution -----------------------------------------------------------------


/** Calculates the legal knight moves in the four dimensional variant. */
function fourDimensionalKnightMove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const legalMoves: Coords[] = [];
	legalMoves.push(...knightLegalMoves(gamefile, coords, color));
	return legalMoves;
}

/**
 * Calculates legal knight moves for the spacelike and timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the knight
 * @param color - The color of the knight
 */
function knightLegalMoves(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const individualMoves: Coords[] = [];
	const dim = fivedimensionalgenerator.get4DBoardDimensions();

	for (let baseH = 2; baseH >= -2; baseH--) {
		for (let baseV = 2; baseV >= -2; baseV--) {
			for (let offsetH = 2; offsetH >= -2; offsetH--) {
				for (let offsetV = 2; offsetV >= -2; offsetV--) {
					// If the squared distance to the tile is 5, then add the move
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 5) {
						const x = coords[0] + dim.BOARD_SPACING * baseH + offsetH;
						const y = coords[1] + dim.BOARD_SPACING * baseV + offsetV;
						const endCoords = [x, y] as Coords;
						const endPiece = gamefileutility.getPieceTypeAtCoords(gamefile, endCoords);

						// do not allow capturing friendly pieces
						if (endPiece && color === colorutil.getPieceColorFromType(endPiece)) continue;

						// do not allow knight to leave the 4D board
						if (endCoords[0] <= dim.MIN_X || endCoords[0] >= dim.MAX_X || endCoords[1] <= dim.MIN_Y || endCoords[1] >= dim.MAX_Y) continue;

						// do not allow the knight to make move if (baseH, baseV) do not match change in 2D chessboard
						if (Math.floor((endCoords[0] - dim.MIN_X) / dim.BOARD_SPACING) - Math.floor((coords[0] - dim.MIN_X) / dim.BOARD_SPACING) !== baseH || 
							Math.floor((endCoords[1] - dim.MIN_Y) / dim.BOARD_SPACING) - Math.floor((coords[1] - dim.MIN_Y) / dim.BOARD_SPACING) !== baseV
						) continue;
						individualMoves.push(endCoords);
					}
				}
			}
		}
	}

	return individualMoves;
}

/** Executes a four dimensional knight move.  */
function doFourDimensionalKnightMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;

	const captureCoords = move.endCoords;
	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, captureCoords);

	if (capturedPiece) boardchanges.queueCapture(moveChanges, piece, true, move.endCoords, capturedPiece); // Delete the piece captured
	else boardchanges.queueMovePiece(moveChanges, piece, true, move.endCoords); // Move the knight

	return true; // Special move was executed!
}


// King Legal Move Calculation and Execution -----------------------------------------------------------------

/** Calculates the legal king moves in the four dimensional variant. */
function fourDimensionalKingMove(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const legalMoves: Coords[] = [];
	legalMoves.push(...kingLegalMoves(gamefile, coords, color));
	legalMoves.push(...specialdetect.kings(gamefile, coords, color));
	return legalMoves;
}

/**
 * Calculates legal king moves for either the spacelike and timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the king
 * @param color - The color of the king
 */
function kingLegalMoves(gamefile: gamefile, coords: Coords, color: string): Coords[] {
	const individualMoves: Coords[] = [];
	const dim = fivedimensionalgenerator.get4DBoardDimensions();

	for (let baseH = 1; baseH >= -1; baseH--) {
		for (let baseV = 1; baseV >= -1; baseV--) {
			for (let offsetH = 1; offsetH >= -1; offsetH--) {
				for (let offsetV = 1; offsetV >= -1; offsetV--) {
					const x = coords[0] + dim.BOARD_SPACING * baseH + offsetH;
					const y = coords[1] + dim.BOARD_SPACING * baseV + offsetV;

					const endCoords = [x, y] as Coords;
					const endPiece = gamefileutility.getPieceTypeAtCoords(gamefile, endCoords);

					// do not allow capturing friendly pieces
					if (endPiece && color === colorutil.getPieceColorFromType(endPiece)) continue;

					// do not allow king to leave the 4D board
					if (endCoords[0] <= dim.MIN_X || endCoords[0] >= dim.MAX_X || endCoords[1] <= dim.MIN_Y || endCoords[1] >= dim.MAX_Y) continue;

					individualMoves.push(endCoords);
				}
			}
		}
	}

	return individualMoves;
}

/** Executes a four dimensional king move.  */
function doFourDimensionalKingMove(gamefile: gamefile, piece: Piece, move: Move): boolean {
	const moveChanges = move.changes;

	const captureCoords = move.endCoords;
	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, captureCoords);

	if (capturedPiece) boardchanges.queueCapture(moveChanges, piece, true, move.endCoords, capturedPiece); // Delete the piece captured
	else boardchanges.queueMovePiece(moveChanges, piece, true, move.endCoords); // Move the king

	return true; // Special move was executed!
}


// Exports ---------------------------------------------------------------------


export default {
	fourDimensionalPawnMove,
	doFourDimensionalPawnMove,
	fourDimensionalKnightMove,
	doFourDimensionalKnightMove,
	fourDimensionalKingMove,
	doFourDimensionalKingMove
};