

/**
 * This script contains overrides for calculating the legal moves
 * of pieces in four dimensional variants, and for executing those moves.
 * 
 * Pieces cannot jump to other timelike boards using spacelike movements,
 * nor can they jump out of bounds.
 */


import type { Piece } from "../util/boardutil.js";
import type { CoordsSpecial } from "./movepiece.js";
import type { Coords } from "./movesets.js";
import type { Player } from "../util/typeutil.js";
import type { Game, Board, FullGame } from "./gamefile.js";
import type { MoveDraftEdit } from "./specialmove.js";

import typeutil from "../util/typeutil.js";
import coordutil from "../util/coordutil.js";
import boardutil from "../util/boardutil.js";
import boardchanges from "./boardchanges.js";
import fourdimensionalgenerator from "../variants/fourdimensionalgenerator.js";
import state from "./state.js";
import specialdetect from "./specialdetect.js";
import bimath from "../../util/bigdecimal/bimath.js";
import legalmoves from "./legalmoves.js";
import { players } from "../util/typeutil.js";


// Pawn Legal Move Calculation and Execution -----------------------------------------------------------------


/** Calculates the legal pawn moves in the four dimensional variant. */
function fourDimensionalPawnMove(gamefile: FullGame, coords: Coords, color: Player, premove: boolean): Coords[] {
	const legalMoves: Coords[] = [];
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, "spacelike", premove)); // Spacelike
	legalMoves.push(...pawnLegalMoves(gamefile, coords, color, "timelike", premove)); // Timelike
	return legalMoves;
}

/**
 * Calculates legal pawn moves for either the spacelike or timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param movetype - spacelike move or timelike move
 */
function pawnLegalMoves(gamefile: FullGame, coords: Coords, color: Player, movetype: "spacelike" | "timelike", premove: boolean): Coords[] {
	const { basegame, boardsim } = gamefile;
	const dim = fourdimensionalgenerator.get4DBoardDimensions();
	const distance =		    (movetype === "spacelike" ? 1n : dim.BOARD_SPACING);
	const distance_complement = (movetype === "spacelike" ? dim.BOARD_SPACING : 1n);
	
	// White and black pawns move and capture in opposite directions.
	const yDistanceParity = color === players.WHITE ? distance : -distance;
	const individualMoves: Coords[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it? And do not allow pawn to leave the 4D board
	const singlePushCoord: Coords = [coords[0], coords[1] + yDistanceParity];
	let moveValidity = legalmoves.testSquareValidity(boardsim, singlePushCoord, color, premove, false);

	if (
		moveValidity === 0 && // Pawns forward-motion validity check must be 0, as they can't capture forward.
		singlePushCoord[0] > dim.MIN_X && singlePushCoord[0] < dim.MAX_X && singlePushCoord[1] > dim.MIN_Y && singlePushCoord[1] < dim.MAX_Y // Pawn within boundaries
	) {
		appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, singlePushCoord, color); // No piece, add the move
		
		// Is the double push legal?
		const doublePushCoord: CoordsSpecial = [singlePushCoord[0], singlePushCoord[1] + yDistanceParity];
		moveValidity = legalmoves.testSquareValidity(boardsim, doublePushCoord, color, premove, false);

		if (
			doesPieceHaveSpecialRight(boardsim, coords) && moveValidity === 0 &&
			doublePushCoord[0] > dim.MIN_X && doublePushCoord[0] < dim.MAX_X && doublePushCoord[1] > dim.MIN_Y && doublePushCoord[1] < dim.MAX_Y
		) { // Add the double push!
			doublePushCoord.enpassantCreate = specialdetect.getEnPassantGamefileProperty(coords, doublePushCoord);
			appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, doublePushCoord, color); // Add the double push!
		}
	}

	// 2. It can capture diagonally if there are opponent pieces there
	const strong_pawns = fourdimensionalgenerator.getMovementType().STRONG_PAWNS;

	const coordsToCapture: Coords[] = [
		[coords[0] - distance, coords[1] + yDistanceParity],
		[coords[0] + distance, coords[1] + yDistanceParity],
	];
	if (strong_pawns) coordsToCapture.push( // Add the brawn-like captures
		[coords[0] - distance_complement, coords[1] + yDistanceParity],
		[coords[0] + distance_complement, coords[1] + yDistanceParity]
	);
	for (const captureCoords of coordsToCapture) {
		const moveValidity = legalmoves.testSquareValidity(boardsim, captureCoords, color, premove, true); // true for capture is required
		if (moveValidity <= 1) appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, captureCoords, color); // Good to add the capture!
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	if (!premove) { // Only add if we're not premoving, since premove captures are added above
		addPossibleEnPassant(gamefile, individualMoves, coords, color, distance, distance);
		if (strong_pawns) addPossibleEnPassant(gamefile, individualMoves, coords, color, distance_complement, distance);
	}

	return individualMoves;
}

/**
 * Adds the en passant capture to the list of individual moves if it is possible.
 * @param gamefile 
 * @param individualMoves - The list of individual moves to add the en passant capture to
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param xdistance
 * @param ydistance
 */
function addPossibleEnPassant({ basegame, boardsim }: FullGame, individualMoves: Coords[], coords: Coords, color: Player, xdistance: bigint, ydistance: bigint): void {
	if (!boardsim.state.global.enpassant) return; // No enpassant flag on the game, no enpassant possible
	if (color !== basegame.whosTurn) return; // Not our turn (the only color who can legally capture enpassant is whos turn it is). If it IS our turn, this also guarantees the captured pawn will be an enemy pawn.
	const enpassantCapturedPawnType = boardutil.getTypeFromCoords(boardsim.pieces, boardsim.state.global.enpassant.pawn)!;
	if (typeutil.getColorFromType(enpassantCapturedPawnType) === color) return; // The captured pawn is not an enemy pawn. THIS IS ONLY EVER NEEDED if we can move opponent pieces on our turn, which is the case in EDIT MODE.

	const xDifference = boardsim.state.global.enpassant.square[0] - coords[0];
	if (bimath.abs(xDifference) !== xdistance) return; // Not immediately left or right of us
	const yDistanceParity = color === players.WHITE ? ydistance : color === players.BLACK ? -ydistance : (() => { throw new Error("Invalid color!"); })();

	if (coords[1] + yDistanceParity !== boardsim.state.global.enpassant.square[1]) return; // Not one in front of us

	// It is capturable en passant!

	/** The square the pawn lands on. */
	const enPassantSquare: CoordsSpecial = coordutil.copyCoords(boardsim.state.global.enpassant.square);

	// TAG THIS MOVE as an en passant capture!! gamefile looks for this tag
	// on the individual move to detect en passant captures and to know what piece to delete
	enPassantSquare.enpassant = true;
	appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, enPassantSquare, color);
}

/**
 * Appends the provided move to the running individual moves list,
 * and adds the `promoteTrigger` special flag to it if it landed on a promotion rank.
 */
function appendPawnMoveAndAttachPromoteFlag(basegame: Game, individualMoves: CoordsSpecial[], landCoords: CoordsSpecial, color: Player) {
	if (basegame.gameRules.promotionRanks !== undefined) {
		const teamPromotionRanks = basegame.gameRules.promotionRanks[color]!;
		if (teamPromotionRanks.includes(landCoords[1])) landCoords.promoteTrigger = true;
	}

	individualMoves.push(landCoords);
}

function doesPieceHaveSpecialRight(boardsim: Board, coords: Coords) {
	const key = coordutil.getKeyFromCoords(coords);
	return boardsim.state.global.specialRights.has(key);
}

/** Executes a four dimensional pawn move.  */
function doFourDimensionalPawnMove(boardsim: Board, piece: Piece, move: MoveDraftEdit): boolean {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the gamefile!
	if (move.enpassantCreate !== undefined) state.createEnPassantState(move, boardsim.state.global.enpassant, move.enpassantCreate);

	if (!move.enpassant && move.promotion === undefined) return false; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = move.enpassant ? boardsim.state.global.enpassant!.pawn : move.endCoords;
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, captureCoords);

	if (capturedPiece) boardchanges.queueCapture(moveChanges, true, capturedPiece); // Delete the piece captured
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords); // Move the pawn

	if (move.promotion !== undefined) { // Handle promotion special move
		boardchanges.queueDeletePiece(moveChanges, true, { type: piece.type, coords: move.endCoords, index: piece.index }); // Delete original pawn
		boardchanges.queueAddPiece(moveChanges, { type: move.promotion, coords: move.endCoords, index: -1 }); // Add promoted piece
	}

	return true; // Special move was executed!
}


// Knight Legal Move Calculation --------------------------------------------------------------------------------


/**
 * Calculates the legal knight moves in the current four dimensional variant
 * for both spacelike and timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the knight
 * @param color - The color of the knight
 */
function fourDimensionalKnightMove(gamefile: FullGame, coords: Coords, color: Player, premove: boolean): Coords[] {
	const individualMoves: Coords[] = [];
	const dim = fourdimensionalgenerator.get4DBoardDimensions();

	for (let baseH = 2n; baseH >= -2n; baseH--) {
		for (let baseV = 2n; baseV >= -2n; baseV--) {
			for (let offsetH = 2n; offsetH >= -2n; offsetH--) {
				for (let offsetV = 2n; offsetV >= -2n; offsetV--) {
					// If the squared distance to the tile is 5, then add the move
					if (baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV === 5n) {
						const x = coords[0] + dim.BOARD_SPACING * baseH + offsetH;
						const y = coords[1] + dim.BOARD_SPACING * baseV + offsetV;
						const endCoords: Coords = [x, y];

						// Don't allow the move if it's blocked by a friendly piece or void
						if (legalmoves.testSquareValidity(gamefile.boardsim, endCoords, color, premove, false) === 2) continue;

						// do not allow knight to leave the 4D board
						if (endCoords[0] <= dim.MIN_X || endCoords[0] >= dim.MAX_X || endCoords[1] <= dim.MIN_Y || endCoords[1] >= dim.MAX_Y) continue;

						// do not allow the knight to make move if (baseH, baseV) do not match change in 2D chessboard
						if ((endCoords[0] - dim.MIN_X) / dim.BOARD_SPACING - (coords[0] - dim.MIN_X) / dim.BOARD_SPACING !== baseH || 
							(endCoords[1] - dim.MIN_Y) / dim.BOARD_SPACING - (coords[1] - dim.MIN_Y) / dim.BOARD_SPACING !== baseV
						) continue;
						individualMoves.push(endCoords);
					}
				}
			}
		}
	}

	return individualMoves;
}


// King Legal Move Calculation ------------------------------------------------------------------------------


/** Calculates the legal king moves in the four dimensional variant. */
function fourDimensionalKingMove(gamefile: FullGame, coords: Coords, color: Player, premove: boolean): Coords[] {
	const legalMoves: Coords[] = kingLegalMoves(gamefile.boardsim, coords, color, premove);
	legalMoves.push(...specialdetect.kings(gamefile, coords, color, premove)); // Adds legal castling
	return legalMoves;
}

/**
 * Calculates legal king moves for either the spacelike and timelike dimensions.
 * @param gamefile
 * @param coords - The coordinates of the king
 * @param color - The color of the king
 */
function kingLegalMoves(boardsim: Board, coords: Coords, color: Player, premove: boolean): Coords[] {
	const individualMoves: Coords[] = [];
	const dim = fourdimensionalgenerator.get4DBoardDimensions();

	for (let baseH = 1n; baseH >= -1n; baseH--) {
		for (let baseV = 1n; baseV >= -1n; baseV--) {
			for (let offsetH = 1n; offsetH >= -1n; offsetH--) {
				for (let offsetV = 1n; offsetV >= -1n; offsetV--) {
					// only allow moves that change one or two dimensions if triagonals and diagonals are disabled
					if (!fourdimensionalgenerator.getMovementType().STRONG_KINGS_AND_QUEENS && baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV > 2) continue;
					if (baseH === 0n && baseV === 0n && offsetH === 0n && offsetV === 0n) continue;

					const x = coords[0] + dim.BOARD_SPACING * baseH + offsetH;
					const y = coords[1] + dim.BOARD_SPACING * baseV + offsetV;
					const endCoords: Coords = [x, y];

					// Do not allow the move if it's blocked by a friendly piece or void
					if (legalmoves.testSquareValidity(boardsim, endCoords, color, premove, false) === 2) continue;

					// do not allow king to leave the 4D board
					if (endCoords[0] <= dim.MIN_X || endCoords[0] >= dim.MAX_X || endCoords[1] <= dim.MIN_Y || endCoords[1] >= dim.MAX_Y) continue;

					individualMoves.push(endCoords);
				}
			}
		}
	}

	return individualMoves;
}


// Exports ---------------------------------------------------------------------


export default {
	fourDimensionalPawnMove,
	doFourDimensionalPawnMove,
	fourDimensionalKnightMove,
	fourDimensionalKingMove,
};