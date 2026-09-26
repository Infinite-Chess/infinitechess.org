// src/shared/chess/logic/fourdimensionalmoves.ts

/**
 * This script contains overrides for calculating the legal moves
 * of pieces in four dimensional variants, and for executing those moves.
 *
 * Pieces cannot jump to other timelike boards using spacelike movements,
 * nor can they jump out of bounds.
 */

import type { Piece } from './boardutil.js';
import type { Board } from './boardinit.js';
import type { Coords } from '../../util/coordutil.js';
import type { Player } from '../util/typeutil.js';
import type { MoveRunning } from './specialmove.js';
import type { CoordsTagged } from './movepiece.js';

import state from './state.js';
import bimath from '../../util/math/bimath.js';
import typeutil from '../util/typeutil.js';
import coordutil from '../../util/coordutil.js';
import boardutil from './boardutil.js';
import legalmoves from './legalmoves.js';
import boardchanges from './boardchanges.js';
import specialdetect from './specialdetect.js';
import { players as p } from '../util/typeutil.js';

// Types -----------------------------------------------------------------------

/** An object that contains all relevant quantities for the size of a single 4D chess board. */
export type Dimensions = {
	/** The spacing of the timelike boards - should be equal to (sidelength of a 2D board) + 1 */
	BOARD_SPACING: bigint;
	/** Board edges on the real chessboard */
	MIN_X: bigint;
	/** Board edges on the real chessboard */
	MAX_X: bigint;
	/** Board edges on the real chessboard */
	MIN_Y: bigint;
	/** Board edges on the real chessboard */
	MAX_Y: bigint;
};

/**
 * One step across the 4D board: how many 2D boards it crosses horizontally and vertically
 * (base), and how many squares it moves within a board (offset).
 */
type Offset4D = { baseH: bigint; baseV: bigint; offsetH: bigint; offsetV: bigint };

// Constants -------------------------------------------------------------------

/** Every knight leap: two steps along one axis and one along another. */
const KNIGHT_OFFSETS = offsetsWithin(2n, (offset) => lengthSquared(offset) === 5n);

/** Every king step changing at most two axes. */
const KING_OFFSETS = offsetsWithin(1n, (offset) => {
	const length = lengthSquared(offset);
	return length > 0n && length <= 2n;
});

/** Every king step, including the triagonal and quadragonal steps of strong kings. */
const STRONG_KING_OFFSETS = offsetsWithin(1n, (offset) => lengthSquared(offset) > 0n);

// 4D Offsets ------------------------------------------------------------------

/**
 * Every offset reaching at most `reach` along each of the four axes that `keep` accepts, in a
 * fixed order: each axis from `reach` down to `-reach`.
 */
function offsetsWithin(reach: bigint, keep: (offset: Offset4D) => boolean): Offset4D[] {
	const offsets: Offset4D[] = [];
	for (let baseH = reach; baseH >= -reach; baseH--) {
		for (let baseV = reach; baseV >= -reach; baseV--) {
			for (let offsetH = reach; offsetH >= -reach; offsetH--) {
				for (let offsetV = reach; offsetV >= -reach; offsetV--) {
					const offset = { baseH, baseV, offsetH, offsetV };
					if (keep(offset)) offsets.push(offset);
				}
			}
		}
	}
	return offsets;
}

/** The squared length of an offset, counting all four axes alike. */
function lengthSquared({ baseH, baseV, offsetH, offsetV }: Offset4D): bigint {
	return baseH * baseH + baseV * baseV + offsetH * offsetH + offsetV * offsetV;
}

/** The square an offset leads to from `coords`, on a real chessboard of 2D boards `boardSpacing` apart. */
function applyOffset(coords: Coords, offset: Offset4D, boardSpacing: bigint): Coords {
	return [
		coords[0] + boardSpacing * offset.baseH + offset.offsetH,
		coords[1] + boardSpacing * offset.baseV + offset.offsetV,
	];
}

// Pawn Legal Move Calculation and Execution -----------------------------------

/** Calculates the legal pawn moves in the four dimensional variant. */
function fourDimensionalPawnMove(
	boardsim: Board,
	coords: Coords,
	color: Player,
	premove: boolean,
	dim: Dimensions,
	strong_pawns: boolean,
): CoordsTagged[] {
	const legalMoves: CoordsTagged[] = [];
	legalMoves.push(
		...pawnLegalMoves(boardsim, coords, color, 'spacelike', premove, dim, strong_pawns),
	); // Spacelike
	legalMoves.push(
		...pawnLegalMoves(boardsim, coords, color, 'timelike', premove, dim, strong_pawns),
	); // Timelike
	return legalMoves;
}

/**
 * Calculates legal pawn moves for either the spacelike or timelike dimensions.
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param movetype - spacelike move or timelike move
 */
function pawnLegalMoves(
	boardsim: Board,
	coords: Coords,
	color: Player,
	movetype: 'spacelike' | 'timelike',
	premove: boolean,
	dim: Dimensions,
	strong_pawns: boolean,
): CoordsTagged[] {
	const distance = movetype === 'spacelike' ? 1n : dim.BOARD_SPACING;
	const distance_complement = movetype === 'spacelike' ? dim.BOARD_SPACING : 1n;

	// White and black pawns move and capture in opposite directions.
	const yDistanceParity = color === p.WHITE ? distance : -distance;
	const individualMoves: CoordsTagged[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it? And do not allow pawn to leave the 4D board
	const singlePushCoord: CoordsTagged = [coords[0], coords[1] + yDistanceParity];
	let moveValidity = legalmoves.testSquareValidity(
		boardsim,
		singlePushCoord,
		color,
		premove,
		false,
	);

	if (
		moveValidity === 0 && // Pawns forward-motion validity check must be 0, as they can't capture forward.
		singlePushCoord[0] > dim.MIN_X &&
		singlePushCoord[0] < dim.MAX_X &&
		singlePushCoord[1] > dim.MIN_Y &&
		singlePushCoord[1] < dim.MAX_Y // Pawn within boundaries
	) {
		appendPawnMoveAndAttachPromoteTag(boardsim, individualMoves, singlePushCoord, color); // No piece, add the move

		// Is the double push legal?
		const doublePushCoord: CoordsTagged = [
			singlePushCoord[0],
			singlePushCoord[1] + yDistanceParity,
		];
		moveValidity = legalmoves.testSquareValidity(
			boardsim,
			doublePushCoord,
			color,
			premove,
			false,
		);

		if (
			doesPieceHaveSpecialRight(boardsim, coords) &&
			moveValidity === 0 &&
			doublePushCoord[0] > dim.MIN_X &&
			doublePushCoord[0] < dim.MAX_X &&
			doublePushCoord[1] > dim.MIN_Y &&
			doublePushCoord[1] < dim.MAX_Y
		) {
			// Add the double push!
			doublePushCoord.enpassantCreate = specialdetect.getEnPassantGamefileProperty(
				coords,
				doublePushCoord,
			);
			appendPawnMoveAndAttachPromoteTag(boardsim, individualMoves, doublePushCoord, color); // Add the double push!
		}
	}

	// 2. It can capture diagonally if there are opponent pieces there
	const coordsToCapture: CoordsTagged[] = [
		[coords[0] - distance, coords[1] + yDistanceParity],
		[coords[0] + distance, coords[1] + yDistanceParity],
	];
	if (strong_pawns)
		coordsToCapture.push(
			// Add the brawn-like captures
			[coords[0] - distance_complement, coords[1] + yDistanceParity],
			[coords[0] + distance_complement, coords[1] + yDistanceParity],
		);
	for (const captureCoords of coordsToCapture) {
		const moveValidity = legalmoves.testSquareValidity(
			boardsim,
			captureCoords,
			color,
			premove,
			true,
		); // true for capture is required
		if (moveValidity <= 1)
			appendPawnMoveAndAttachPromoteTag(boardsim, individualMoves, captureCoords, color); // Good to add the capture!
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	if (!premove) {
		// Only add if we're not premoving, since premove captures are added above
		addPossibleEnPassant(boardsim, individualMoves, coords, color, distance, distance);
		if (strong_pawns)
			addPossibleEnPassant(
				boardsim,
				individualMoves,
				coords,
				color,
				distance_complement,
				distance,
			);
	}

	return individualMoves;
}

/**
 * Adds the en passant capture to the list of individual moves if it is possible.
 * Mirrors `addPossibleEnPassant` in specialdetect.ts: a change here must be made there too.
 * @param individualMoves - The list of individual moves to add the en passant capture to
 * @param coords - The coordinates of the pawn
 * @param color - The color of the pawn
 * @param xdistance
 * @param ydistance
 */
function addPossibleEnPassant(
	boardsim: Board,
	individualMoves: CoordsTagged[],
	coords: Coords,
	color: Player,
	xdistance: bigint,
	ydistance: bigint,
): void {
	if (!boardsim.state.global.enpassant) return; // No enpassant flag on the game, no enpassant possible
	if (color !== boardsim.whosTurn) return; // Not our turn (the only color who can legally capture enpassant is whos turn it is). If it IS our turn, this also guarantees the captured pawn will be an enemy pawn.
	const enpassantCapturedPawnType = boardutil.getTypeFromCoords(
		boardsim.pieces,
		boardsim.state.global.enpassant.pawn,
	)!;
	if (typeutil.getColorFromType(enpassantCapturedPawnType) === color) return; // The captured pawn is not an enemy pawn. THIS IS ONLY EVER NEEDED if we can move opponent pieces on our turn, which is the case in EDIT MODE.

	const xDifference = boardsim.state.global.enpassant.square[0] - coords[0];
	if (bimath.abs(xDifference) !== xdistance) return; // Not immediately left or right of us
	// prettier-ignore
	const yDistanceParity = color === p.WHITE ? ydistance : color === p.BLACK ? -ydistance : (() => { throw new Error("Invalid color!"); })();

	if (coords[1] + yDistanceParity !== boardsim.state.global.enpassant.square[1]) return; // Not one in front of us

	// It is capturable en passant!

	/** The square the pawn lands on. */
	const enPassantSquare: CoordsTagged = coordutil.copyCoords(
		boardsim.state.global.enpassant.square,
	);

	// TAG THIS MOVE as an en passant capture!! boardsim looks for this tag
	// on the individual move to detect en passant captures and to know what piece to delete
	enPassantSquare.enpassant = true;
	appendPawnMoveAndAttachPromoteTag(boardsim, individualMoves, enPassantSquare, color);
}

/**
 * Appends the provided move to the running individual moves list,
 * and adds the `promoteTrigger` special flag to it if it landed on a promotion rank.
 */
function appendPawnMoveAndAttachPromoteTag(
	boardsim: Board,
	individualMoves: CoordsTagged[],
	landCoords: CoordsTagged,
	color: Player,
): void {
	if (boardsim.gameRules.promotion !== undefined) {
		const teamPromotionRanks = boardsim.gameRules.promotion.ranks[color];
		if (teamPromotionRanks?.includes(landCoords[1])) landCoords.promoteTrigger = true;
	}

	individualMoves.push(landCoords);
}

/** Whether the piece on these coords still holds its special right. */
function doesPieceHaveSpecialRight(boardsim: Board, coords: Coords): boolean {
	const key = coordutil.getKeyFromCoords(coords);
	return boardsim.state.global.specialRights.has(key);
}

/** Executes a four dimensional pawn move.  */
function doFourDimensionalPawnMove(boardsim: Board, piece: Piece, move: MoveRunning): boolean {
	const moveChanges = move.changes;

	// If it was a double push, then queue adding the new enpassant square to the boardsim!
	if (move.enpassantCreate !== undefined)
		state.createEnPassantState(move, boardsim.state.global.enpassant, move.enpassantCreate);

	if (!move.enpassant && move.promotion === undefined) return false; // No special move to execute, return false to signify we didn't move the piece.

	const captureCoords = move.enpassant ? boardsim.state.global.enpassant!.pawn : move.endCoords;
	const capturedPiece = boardutil.getPieceFromCoords(boardsim.pieces, captureCoords);

	if (capturedPiece) boardchanges.queueCapture(moveChanges, true, capturedPiece); // Delete the piece captured
	boardchanges.queueMovePiece(moveChanges, true, piece, move.endCoords); // Move the pawn

	if (move.promotion !== undefined) {
		// Handle promotion special move
		boardchanges.queueDeletePiece(moveChanges, true, {
			type: piece.type,
			coords: move.endCoords,
			index: piece.index,
		}); // Delete original pawn
		boardchanges.queueAddPiece(moveChanges, {
			type: move.promotion,
			coords: move.endCoords,
			index: -1,
		}); // Add promoted piece
	}

	return true; // Special move was executed!
}

// Knight Legal Move Calculation -----------------------------------------------

/**
 * Calculates the legal knight moves in the current four dimensional variant
 * for both spacelike and timelike dimensions.
 * @param coords - The coordinates of the knight
 * @param color - The color of the knight
 */
function fourDimensionalKnightMove(
	boardsim: Board,
	coords: Coords,
	color: Player,
	premove: boolean,
	dim: Dimensions,
): Coords[] {
	const individualMoves: Coords[] = [];

	for (const offset of KNIGHT_OFFSETS) {
		const endCoords = applyOffset(coords, offset, dim.BOARD_SPACING);
		if (!isLandingAllowed(boardsim, endCoords, color, premove, dim)) continue;

		// do not allow the knight to make move if (baseH, baseV) do not match change in 2D chessboard
		if (
			(endCoords[0] - dim.MIN_X) / dim.BOARD_SPACING -
				(coords[0] - dim.MIN_X) / dim.BOARD_SPACING !==
				offset.baseH ||
			(endCoords[1] - dim.MIN_Y) / dim.BOARD_SPACING -
				(coords[1] - dim.MIN_Y) / dim.BOARD_SPACING !==
				offset.baseV
		)
			continue;
		individualMoves.push(endCoords);
	}

	return individualMoves;
}

/** Whether a piece may land on a square: not blocked by a friendly piece or void, and on the 4D board. */
function isLandingAllowed(
	boardsim: Board,
	endCoords: Coords,
	color: Player,
	premove: boolean,
	dim: Dimensions,
): boolean {
	if (legalmoves.testSquareValidity(boardsim, endCoords, color, premove, false) === 2)
		return false;
	return (
		endCoords[0] > dim.MIN_X &&
		endCoords[0] < dim.MAX_X &&
		endCoords[1] > dim.MIN_Y &&
		endCoords[1] < dim.MAX_Y
	);
}

// King Legal Move Calculation -------------------------------------------------

/** Calculates the legal king moves in the four dimensional variant. */
function fourDimensionalKingMove(
	boardsim: Board,
	coords: Coords,
	color: Player,
	premove: boolean,
	dim: Dimensions,
	strong_kings_and_queens: boolean,
): Coords[] {
	const legalMoves: Coords[] = kingLegalMoves(
		boardsim,
		coords,
		color,
		premove,
		dim,
		strong_kings_and_queens,
	);
	legalMoves.push(...specialdetect.kings(boardsim, coords, color, premove)); // Adds legal castling
	return legalMoves;
}

/**
 * Calculates legal king moves for either the spacelike and timelike dimensions.
 * @param coords - The coordinates of the king
 * @param color - The color of the king
 */
function kingLegalMoves(
	boardsim: Board,
	coords: Coords,
	color: Player,
	premove: boolean,
	dim: Dimensions,
	strong_kings_and_queens: boolean,
): Coords[] {
	const offsets = strong_kings_and_queens ? STRONG_KING_OFFSETS : KING_OFFSETS;
	const individualMoves: Coords[] = [];

	for (const offset of offsets) {
		const endCoords = applyOffset(coords, offset, dim.BOARD_SPACING);
		if (isLandingAllowed(boardsim, endCoords, color, premove, dim))
			individualMoves.push(endCoords);
	}

	return individualMoves;
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	KNIGHT_OFFSETS,
	KING_OFFSETS,
	STRONG_KING_OFFSETS,
	// 4D Offsets
	offsetsWithin,
	lengthSquared,
	applyOffset,
	// Pawn Legal Move Calculation and Execution
	fourDimensionalPawnMove,
	doFourDimensionalPawnMove,
	// Knight Legal Move Calculation
	fourDimensionalKnightMove,
	// King Legal Move Calculation
	fourDimensionalKingMove,
};
