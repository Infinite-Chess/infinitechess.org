
// Import Start
import gamefileutility from '../util/gamefileutility.js';
import boardutil from '../util/boardutil.js';
import organizedpieces from './organizedpieces.js';
import typeutil from '../util/typeutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
import gamerules from '../variants/gamerules.js';
import math from '../../util/math.js';
import checkresolver from './checkresolver.js';
import { players, rawTypes } from '../util/typeutil.js';
// Import End

import type { FullGame, Game, Board } from './gamefile.js';
import type { MoveDraft } from './movepiece.js';
import type { Coords } from '../util/coordutil.js';
import type { CoordsSpecial } from './movepiece.js';
import type { enpassantCreate } from './movepiece.js';
import type { Player } from '../util/typeutil.js';
import bimath from '../../util/bigdecimal/bimath.js';

"use strict";

/**
 * This detects if special moves are legal.
 * Does NOT execute the moves!
 */

/** All types of special moves that exist, for iterating through. */
const allSpecials = ['enpassantCreate','enpassant','promoteTrigger','promotion','castle','path'];

// EVERY one of these functions needs to include enough information in the special move tag
// to be able to undo any of them!

/**
 * Appends legal king special moves to the provided legal individual moves list. (castling)
 * @param gamefile - The gamefile
 * @param coords - Coordinates of the king selected
 * @param color - The color of the king selected
 * @param all_possible - Whether we should return all possible moves (premoving)
 */
function kings(gamefile: FullGame, coords: Coords, color: Player, all_possible: boolean): CoordsSpecial[] {
	const individualMoves: CoordsSpecial[] = [];

	const { boardsim, basegame } = gamefile;

	if (!doesPieceHaveSpecialRight(boardsim, coords)) return individualMoves; // King doesn't have castling rights

	const king = boardutil.getPieceFromCoords(boardsim.pieces, coords)!;
	const kingX = coords[0];
	const kingY = coords[1];
	const oppositeColor = typeutil.invertPlayer(color);
	const key = organizedpieces.getKeyFromLine([1n,0n],coords);
	const row = boardsim.pieces.lines.get('1,0')!.get(key)!;

	// Add legal Castling...

	let left: bigint | null = null; // Piece directly left of king. (Infinity if none)
	let right: bigint | null = null; // Piece directly right of king. (Infinity if none)

	// If premoving, skip obstruction and check checks.
	if (all_possible) {

		// Find the closest CASTLEABLE piece on each side of the king.
		for (const idx of row) {
			const pieceCoords = boardutil.getCoordsFromIdx(boardsim.pieces, idx);

			if (!isPieceCastleable(pieceCoords)) continue; // Piece is not castleable, skip it

			if (pieceCoords[0] < kingX && (left === null || pieceCoords[0] > left)) left = pieceCoords[0];
			else if (pieceCoords[0] > kingX && (right === null || pieceCoords[0] < right)) right = pieceCoords[0];
		}

		// THEN append the castling moves to the individual moves.
		processSide(left, -1n, all_possible); // Castling left
		processSide(right, 1n, all_possible); // Castling right

	} else { // Not premoving. Perform obsctruction and check checks as normal.

		// Find the CLOSEST piece on each side of the king.
		for (const idx of row) {
			const pieceCoords = boardutil.getCoordsFromIdx(boardsim.pieces, idx);

			if (pieceCoords[0] < kingX && (left === null || pieceCoords[0] > left)) left = pieceCoords[0];
			else if (pieceCoords[0] > kingX && (right === null || pieceCoords[0] < right)) right = pieceCoords[0];
		}

		// THEN check if the piece is castleable.
		processSide(left, -1n, all_possible); // Castling left
		processSide(right, 1n, all_possible); // Castling right
	}

	/**
	 * Returns whether the piece at the given coordinates is castleable:
	 * * Its distance from the king is atleast 3 squares
	 * * It has its special rights
	 * * It is a friendly piece
	 * * It is not a pawn or jumping royal
	 */
	function isPieceCastleable(pieceCoords: Coords): boolean {

		// Distance should be atleast 3 squares away.
		const dist = bimath.abs(kingX - pieceCoords[0]); // Distance from the king to the piece
		if (dist < 3) return false; // Piece is too close, can't castle with it

		// Piece should have its special rights
		if (!doesPieceHaveSpecialRight(boardsim, pieceCoords)) return false; // Piece doesn't have special rights, can't castle with it

		// Color should be a friendly piece
		const pieceType: number = boardutil.getTypeFromCoords(boardsim.pieces, pieceCoords)!;
		const [rawType, pieceColor] = typeutil.splitType(pieceType);
		if (pieceColor !== color) return false;

		// Piece should not be a pawn or jumping royal
		if (rawType === rawTypes.PAWN || typeutil.jumpingRoyals.includes(rawType)) return false;

		return true;
	}

	/**
	 * If the given side is legal to castle with, it will append the castling move to the individual moves.
	 * @param pieceX - The X coordinate of the piece that the king is castling with, or -Infinity/Infinity if there is no piece on that side.
	 * @param dir - The direction the king is moving in. 1 for right, -1 for left.
	 * @param all_possible - PREMOVING: Whether we should ignore checks.
	 */
	function processSide(pieceX: bigint | null, dir: 1n | -1n, all_possible: boolean): void {

		if (pieceX === null) return; // No piece on this side, can't castle with it

		const pieceCoord: Coords = [pieceX, kingY]; // The coordinates of the piece that the king is castling with.

		if (!isPieceCastleable(pieceCoord)) return; // Piece is not castleable, skip it
		
		// Check checks: Only need if opponent is using checkmate as a win condition.
		// Can skip if we're premoving, as we can't predict if we will be in check.
		if (gamerules.doesColorHaveWinCondition(basegame.gameRules, oppositeColor, 'checkmate') && !all_possible) { 

			// Can't currently be in check
			if (gamefileutility.isCurrentViewedPositionInCheck(boardsim)) return; // Not legal if in check

			// The square the king passes through must not be a check. Let's simulate that.
			const middleSquare: Coords = [kingX + dir, kingY]; // The square the king passes through
			if (checkresolver.isMoveCheckInvalid(gamefile, king, middleSquare, color)) return; // The square the king passes through is a check

			// The square the king LANDS ON will be tested later, within checkresolver.
		}

		// All checks passed, this side is legal to castle with. Add the move!
		
		const specialMove: CoordsSpecial = [coords[0] + (2n * dir), coords[1]];
		specialMove.castle = { dir, coord: pieceCoord }; // The special move flag, containing: The direction the king is moving in, and the coordinates of the piece that the king is castling with.
		individualMoves.push(specialMove);
	}

	return individualMoves;
}

/**
 * Appends legal pawn moves to the provided legal individual moves list.
 * This also is in charge of adding single-push, double-push, and capturing
 * pawn moves, even though those don't need a special move flag.
 * @param gamefile - The gamefile
 * @param coords - Coordinates of the pawn selected
 * @param color - The color of the pawn selected
 * @param all_possible - Whether we should return all possible moves (premoving)
 */
function pawns(gamefile: FullGame, coords: Coords, color: Player, all_possible: boolean): CoordsSpecial[] {
	const { boardsim, basegame } = gamefile;
	// White and black pawns move and capture in opposite directions.
	const yOneorNegOne = color === players.WHITE ? 1n : -1n;
	const individualMoves: CoordsSpecial[] = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it?
	const coordsInFront: Coords = [coords[0], coords[1] + yOneorNegOne];
	if (boardutil.getTypeFromCoords(boardsim.pieces, coordsInFront) === undefined || all_possible) { // No piece in front of it, OR we're premoving
		appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, coordsInFront, color); // No piece, add the move

		// Further... Is the double push legal?
		const doublePushCoord: CoordsSpecial = [coordsInFront[0], coordsInFront[1] + yOneorNegOne];
		const pieceAtCoords = boardutil.getTypeFromCoords(boardsim.pieces, doublePushCoord);
		if (doesPieceHaveSpecialRight(boardsim, coords) && (pieceAtCoords === undefined || all_possible)) { // Add the double push!
			doublePushCoord.enpassantCreate = getEnPassantGamefileProperty(coords, doublePushCoord);
			appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, doublePushCoord, color); 
		}
	}

	// 2. It can capture diagonally if there are opponent pieces there

	const coordsToCapture: Coords[] = [
        [coords[0] - 1n, coords[1] + yOneorNegOne],
        [coords[0] + 1n, coords[1] + yOneorNegOne]
    ];
	for (let i = 0; i < 2; i++) {
		const thisCoordsToCapture: Coords = coordsToCapture[i]!;

		if (!all_possible) { // Only perform obstruction checks if we're not premoving
			// Is there an enemy piece at this coords?
			const pieceAtCoords = boardutil.getTypeFromCoords(boardsim.pieces, thisCoordsToCapture);
			if (pieceAtCoords === undefined) continue; // No piece, skip.

			// There is a piece. Make sure it's a different color
			const colorOfPiece = typeutil.getColorFromType(pieceAtCoords);
			if (color === colorOfPiece) continue; // Same color, don't add the capture

			// Make sure it isn't a void
			if (typeutil.getRawType(pieceAtCoords) === rawTypes.VOID) continue;
		}

		appendPawnMoveAndAttachPromoteFlag(basegame, individualMoves, thisCoordsToCapture, color); // Good to add the capture!
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	// Skip if we're premoving, as the capturing moves are added above
	if (!all_possible) addPossibleEnPassant(gamefile, individualMoves, coords, color);

	return individualMoves;
}

/**
 * Returns what the gamefile's enpassant property should be after this double pawn push move
 * @param moveStartCoords - The start coordinates of the move
 * @param moveEndCoords - The end coordinates of the move
 * @returns The coordinates en passant is allowed
 */
function getEnPassantGamefileProperty(moveStartCoords: Coords, moveEndCoords: Coords): enpassantCreate {
	const y = (moveStartCoords[1] + moveEndCoords[1]) / 2n;
	const enpassantSquare: Coords = [moveStartCoords[0], y];
	return { square: enpassantSquare, pawn: coordutil.copyCoords(moveEndCoords) }; // Copy needed to strip endCoords of existing special flags
}

/**
 * Appends legal enpassant capture to the selected pawn's provided individual moves.
 * @param gamefile - The gamefile
 * @param individualMoves - The running list of legal individual moves
 * @param coords - The coordinates of the pawn selected, [x,y]
 * @param color - The color of the pawn selected
 */
// If it can capture en passant, the move is appended to  legalmoves
function addPossibleEnPassant({ boardsim, basegame }: FullGame, individualMoves: Coords[], coords: Coords, color: Player) {
	if (boardsim.state.global.enpassant === undefined) return; // No enpassant flag on the game, no enpassant possible
	if (color !== basegame.whosTurn) return; // Not our turn (the only color who can legally capture enpassant is whos turn it is). If it IS our turn, this also guarantees the captured pawn will be an enemy pawn.
	const enpassantCapturedPawn = boardutil.getTypeFromCoords(boardsim.pieces, boardsim.state.global.enpassant.pawn)!;
	if (typeutil.getColorFromType(enpassantCapturedPawn) === color) return; // The captured pawn is not an enemy pawn. THIS IS ONLY EVER NEEDED if we can move opponent pieces on our turn, which is the case in EDIT MODE.

	const xDifference = boardsim.state.global.enpassant.square[0] - coords[0];
	if (bimath.abs(xDifference) !== 1n) return; // Not immediately left or right of us
	const yParity = color === players.WHITE ? 1n : -1n;
	if (coords[1] + yParity !== boardsim.state.global.enpassant.square[1]) return; // Not one in front of us

	// It is capturable en passant!

	/** The square the pawn lands on. */
	const enPassantSquare: CoordsSpecial = coordutil.copyCoords(boardsim.state.global.enpassant.square);

	// TAG THIS MOVE as an en passant capture!! gamefile looks for this tag
	// on the individual move to detect en passant captures and know when to perform them.
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

/**
 * Appends legal moves for the rose piece to the provided legal individual moves list.
 * @param gamefile - The gamefile
 * @param coords - Coordinates of the rose selected
 * @param color - The color of the rose selected
 * @param all_possible - Whether we should return all possible moves (premoving)
 * @returns
 */
function roses({ boardsim }: FullGame, coords: Coords, color: Player, all_possible: boolean): CoordsSpecial[] {
	const movements: Coords[] = [[-2n, -1n], [-1n, -2n], [1n, -2n], [2n, -1n], [2n, 1n], [1n, 2n], [-1n, 2n], [-2n, 1n]]; // Counter-clockwise
	const directions = [1, -1] as const; // Counter-clockwise and clockwise directions
	const individualMoves: CoordsSpecial[] = [];

	for (let i = 0; i < movements.length; i++) {
		for (const direction of directions) {
			/** @type {CoordsSpecial} */
			let currentCoord: CoordsSpecial = coordutil.copyCoords(coords);
			let b = i;
			const path = [coords]; // The running path of travel for the current spiral. Used for animating.
			for (let c = 0; c < movements.length - 1; c++) { // Iterate 7 times, since we can't land on the square we started
				const movement = movements[math.posMod(b, movements.length)]!;
				currentCoord = coordutil.addCoordinates(currentCoord, movement);
				path.push(coordutil.copyCoords(currentCoord));
				const pieceOnSquare = boardutil.getPieceFromCoords(boardsim.pieces, currentCoord); // { type, index, coords }
				if (pieceOnSquare && !all_possible) { // If there is a piece on the square and we're not premoving
					const colorOfPiece = typeutil.getColorFromType(pieceOnSquare.type);
					if (color !== colorOfPiece) appendCoordToIndividuals(currentCoord, path); // Capture is legal
					break; // Break the spiral
				}
				// There is not a piece
				appendCoordToIndividuals(currentCoord, path);
				b += direction; // Update 'b' for the next iteration
			}
		}
	}

	return individualMoves;

	/**
	 * Appends a ROSE coordinate to the individual moves list if it's not already present.
	 * If it is present, it chooses the one according to this priority:
	 * 1. Shortest path
	 * 2. Path that curves towards the center of play
	 * 3. Randomly pick one
	 * @param {Coords} newCoord - The coordinate to append [x, y].
	 */
	function appendCoordToIndividuals(newCoord: CoordsSpecial, path: Coords[]) {
		newCoord.path = jsutil.deepCopyObject(path);
		for (let i = 0; i < individualMoves.length; i++) {
			const coord = individualMoves[i]!;
			if (!coordutil.areCoordsEqual(coord, newCoord)) continue;
			/*
			 * This coord has already been added to our individual moves!!!
			 * Pick the one with the shortest path.
			 */
			if (coord.path!.length < newCoord.path.length) individualMoves[i] = coord; // First path shorter
			else if (coord.path!.length > newCoord.path.length) individualMoves[i] = newCoord; // Second path shorter
			else if (coord.path!.length === newCoord.path.length) { // Path are equal length
				if (!boardsim.startSnapshot) {
					// Center of play hasn't been calculated, choose a random one instead of curving towards the center.
					individualMoves[i] = Math.random() < 0.5 ? coord : newCoord;
					return;
				}
				// Pick the one that curves towards the center of play,
				// as that's more likely to stay within the window during animation.
				const centerOfPlay = math.calcCenterOfBoundingBox(boardsim.startSnapshot.box);
				const vectorToCenter = math.calculateVectorFromPoints(coords, centerOfPlay);
				const existingCoordVector = math.calculateVectorFromPoints(coords, coord.path![1]!);
				const newCoordVector = math.calculateVectorFromPoints(coords, newCoord.path[1]!);
				// Whichever's dot product scores higher is the one that curves more towards the center
				const existingCoordDotProd = math.dotProduct(existingCoordVector, vectorToCenter);
				const newCoordDotProd = math.dotProduct(newCoordVector, vectorToCenter);
				if (existingCoordDotProd > newCoordDotProd) individualMoves[i] = coord; // Existing move's path curves more towards the center
				else if (existingCoordDotProd < newCoordDotProd) individualMoves[i] = newCoord; // New move's path curves more towards the center
				else if (existingCoordDotProd === newCoordDotProd) { // BOTH point equally point towards the origin.
					// JUST pick a random one!
					individualMoves[i] = Math.random() < 0.5 ? coord : newCoord;
				}
			}

			return;
		}
		
		// This coordinate has not been added yet. Let's do it now.
		individualMoves.push(newCoord);
	}
}

/**
 * Tests if the piece at the given coordinates has it's special move rights.
 * @param gamefile - The gamefile
 * @param coords - The coordinates of the piece
 * @returns *true* if it has it's special move rights.
 */
function doesPieceHaveSpecialRight(boardsim: Board, coords: Coords): boolean {
	const key = coordutil.getKeyFromCoords(coords);
	return boardsim.state.global.specialRights.has(key);
}

// Returns true if the type is a pawn and the coords it moved to is a promotion line

/**
 * Returns true if a pawn moved onto a promotion line.
 * @param gamefile
 * @param type 
 * @param coordsClicked 
 * @returns
 */
function isPawnPromotion(basegame: Game, type: number, coordsClicked: Coords): boolean {
	if (typeutil.getRawType(type) !== rawTypes.PAWN) return false;
	if (!basegame.gameRules.promotionRanks) return false; // This game doesn't have promotion.

	const color = typeutil.getColorFromType(type);
	const promotionRanks = basegame.gameRules.promotionRanks[color]!;

	return promotionRanks.includes(coordsClicked[1]);
}

/**
 * Transfers any special move flags from the provided coordinates to the move.
 * @param coords - The coordinates
 * @param {MoveDraft} move - The move
 */
function transferSpecialFlags_FromCoordsToMove(coords: CoordsSpecial, move: MoveDraft) {
	for (const special of allSpecials) {
		// @ts-ignore
		if (coords[special] !== undefined) {
			// @ts-ignore
			move[special] = jsutil.deepCopyObject(coords[special]);
		}
	}
}

/**
 * Transfers any special move flags from the provided move to the coordinates.
 * @param coords - The coordinates
 * @param {MoveDraft} move - The move
 */
function transferSpecialFlags_FromMoveToCoords(move: MoveDraft, coords: Coords) {
	for (const special of allSpecials) {
		// @ts-ignore
		if (move[special]) coords[special] = jsutil.deepCopyObject(move[special]);
	}
}

/**
 * Transfers any special move flags from the one pair of coordinates to another.
 * @param srcCoords - The source coordinates
 * @param destCoords - The destination coordinates
 */
function transferSpecialFlags_FromCoordsToCoords(srcCoords: CoordsSpecial, destCoords: CoordsSpecial) {
	for (const special of allSpecials) {
		// @ts-ignore
		if (srcCoords[special] !== undefined) destCoords[special] = jsutil.deepCopyObject(srcCoords[special]);
	}
}

export default {
	kings,
	pawns,
	roses,
	getEnPassantGamefileProperty,
	isPawnPromotion,
	transferSpecialFlags_FromCoordsToMove,
	transferSpecialFlags_FromMoveToCoords,
	transferSpecialFlags_FromCoordsToCoords,
};