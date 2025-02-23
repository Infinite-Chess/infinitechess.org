
// Import Start
import gamefileutility from '../util/gamefileutility.js';
import organizedlines from './organizedlines.js';
import checkdetection from './checkdetection.js';
import colorutil from '../util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../util/coordutil.js';
import gamerules from '../variants/gamerules.js';
import math from '../../util/math.js';
// Import End

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 * @typedef {import('./movepiece.js').MoveDraft} MoveDraft
 * @typedef {import('../util/coordutil.js').Coords} Coords
 * @typedef {import('./movepiece.js').CoordsSpecial} CoordsSpecial
 * @typedef {import('./movepiece.js').enpassantCreate} enpassantCreate
 */

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
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - Coordinates of the king selected
 * @param {string} color - The color of the king selected
 * @returns {CoordsSpecial[]}
 */
function kings(gamefile, coords, color, ) {
	const individualMoves = [];

	if (!doesPieceHaveSpecialRight(gamefile, coords)) return individualMoves; // King doesn't have castling rights

	const x = coords[0];
	const y = coords[1];
	const key = organizedlines.getKeyFromLine([1,0],coords);
	const row = gamefile.piecesOrganizedByLines['1,0'][key];


	// Castling. What makes a castle legal?

	let leftLegal = true;
	let rightLegal = true;

	// 1. There is a piece directly left or right of us that has
	// it's special move rights, that is atleast 3 squares away.

	let left = -Infinity; // Piece directly left of king. (Infinity if none)
	let right = Infinity; // Piece directly right of king. (Infinity if none)
	for (let i = 0; i < row.length; i++) {
		const thisPiece = row[i]; // { type, coords }
		const thisCoord = thisPiece.coords;

		if (thisCoord[0] < x && thisCoord[0] > left) left = thisCoord[0];
		else if (thisCoord[0] > x && thisCoord[0] < right) right = thisCoord[0];
	}

	const leftDist = x - left;
	const rightDist = right - x;
	const leftCoord = [left, y];
	const rightCoord = [right, y];
	const leftPieceType = gamefileutility.getPieceTypeAtCoords(gamefile, leftCoord);
	const rightPieceType = gamefileutility.getPieceTypeAtCoords(gamefile, rightCoord);
	const leftColor = leftPieceType ? colorutil.getPieceColorFromType(leftPieceType) : undefined;
	const rightColor = rightPieceType ? colorutil.getPieceColorFromType(rightPieceType) : undefined;

	if (left === -Infinity || leftDist < 3 || !doesPieceHaveSpecialRight(gamefile, leftCoord) || leftColor !== color || leftPieceType.startsWith('pawns')) leftLegal = false;
	if (right === Infinity || rightDist < 3 || !doesPieceHaveSpecialRight(gamefile, rightCoord) || rightColor !== color || rightPieceType.startsWith('pawns')) rightLegal = false;
	if (!leftLegal && !rightLegal) return individualMoves;

	// 2. IF USING CHECKMATE: The king must not currently be in check,
	// AND The square the king passes through must not be a check.
	// The square the king lands on will be tested later, within  legalmoves.calculate()

	const oppositeColor = colorutil.getOppositeColor(color);
	if (gamerules.doesColorHaveWinCondition(gamefile.gameRules, oppositeColor, 'checkmate')) {
		if (gamefileutility.isCurrentViewedPositionInCheck(gamefile)) return individualMoves; // Not legal if in check

		// Simulate the space in-between

		const king = gamefileutility.getPieceAtCoords(gamefile, coords); // { type, index, coords }
		if (leftLegal) {
			const middleSquare = [x - 1, y];
			if (checkdetection.doesMovePutInCheck(gamefile, king, middleSquare, color)) leftLegal = false;
		} if (rightLegal) {
			const middleSquare = [x + 1, y];
			if (checkdetection.doesMovePutInCheck(gamefile, king, middleSquare, color)) rightLegal = false;
		}
	}

	// Add move

	if (leftLegal) {
		const specialMove = [coords[0] - 2, coords[1]];
		specialMove.castle = { dir: -1, coord: leftCoord};
		individualMoves.push(specialMove);
	}

	if (rightLegal) {
		const specialMove = [coords[0] + 2, coords[1]];
		specialMove.castle = { dir: 1, coord: rightCoord};
		individualMoves.push(specialMove);
	}

	return individualMoves;
}

/**
 * Appends legal pawn moves to the provided legal individual moves list.
 * This also is in charge of adding single-push, double-push, and capturing
 * pawn moves, even though those don't need a special move flag.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - Coordinates of the pawn selected
 * @param {string} color - The color of the pawn selected
 * @returns {CoordsSpecial[]}
 */
function pawns(gamefile, coords, color) {

	// White and black pawns move and capture in opposite directions.
	const yOneorNegOne = color === 'white' ? 1 : -1; 
	const individualMoves = [];
	// How do we go about calculating a pawn's legal moves?

	// 1. It can move forward if there is no piece there

	// Is there a piece in front of it?
	const coordsInFront = [coords[0], coords[1] + yOneorNegOne];
	if (!gamefileutility.getPieceTypeAtCoords(gamefile, coordsInFront)) {
		appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, coordsInFront, color); // No piece, add the move

		// Further... Is the double push legal?
		const doublePushCoord = [coordsInFront[0], coordsInFront[1] + yOneorNegOne];
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, doublePushCoord);
		if (!pieceAtCoords && doesPieceHaveSpecialRight(gamefile, coords)) { // Add the double push!
			doublePushCoord.enpassantCreate = getEnPassantGamefileProperty(coords, doublePushCoord);
			appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, doublePushCoord, color); 
		}
	}

	// 2. It can capture diagonally if there are opponent pieces there

	const coordsToCapture = [
        [coords[0] - 1, coords[1] + yOneorNegOne],
        [coords[0] + 1, coords[1] + yOneorNegOne]
    ];
	for (let i = 0; i < 2; i++) {
		const thisCoordsToCapture = coordsToCapture[i];

		// Is there an enemy piece at this coords?
		const pieceAtCoords = gamefileutility.getPieceTypeAtCoords(gamefile, thisCoordsToCapture);
		if (!pieceAtCoords) continue; // No piece, skip

		// There is a piece. Make sure it's a different color
		const colorOfPiece = colorutil.getPieceColorFromType(pieceAtCoords);
		if (color === colorOfPiece) continue; // Same color, don't add the capture

		// Make sure it isn't a void
		if (pieceAtCoords.startsWith('voids')) continue;

		appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, thisCoordsToCapture, color); // Good to add the capture!
	}

	// 3. It can capture en passant if a pawn next to it just pushed twice.
	addPossibleEnPassant(gamefile, individualMoves, coords, color);

	return individualMoves;
}

/**
 * Returns what the gamefile's enpassant property should be after this double pawn push move
 * @param {number[]} moveStartCoords - The start coordinates of the move
 * @param {number[]} moveEndCoords - The end coordinates of the move
 * @returns {enpassantCreate} The coordinates en passant is allowed
 */
function getEnPassantGamefileProperty(moveStartCoords, moveEndCoords) {
	const y = (moveStartCoords[1] + moveEndCoords[1]) / 2;
	const enpassantSquare = [moveStartCoords[0], y];
	return { square: enpassantSquare, pawn: coordutil.copyCoords(moveEndCoords) }; // Copy needed to strip endCoords of existing special flags
}

/**
 * Appends legal enpassant capture to the selected pawn's provided individual moves.
 * @param {gamefile} gamefile - The gamefile
 * @param {array[]} individualMoves - The running list of legal individual moves
 * @param {number[]} coords - The coordinates of the pawn selected, [x,y]
 * @param {string} color - The color of the pawn selected
 */
// If it can capture en passant, the move is appended to  legalmoves
function addPossibleEnPassant(gamefile, individualMoves, coords, color) {
	if (gamefile.enpassant === undefined) return; // No enpassant flag on the game, no enpassant possible

	const xDifference = gamefile.enpassant.square[0] - coords[0];
	if (Math.abs(xDifference) !== 1) return; // Not immediately left or right of us
	const yParity = color === 'white' ? 1 : -1;
	if (coords[1] + yParity !== gamefile.enpassant.square[1]) return; // Not one in front of us

	// It is capturable en passant!

	/** The square the pawn lands on. */
	const enPassantSquare = coordutil.copyCoords(gamefile.enpassant.square);

	// TAG THIS MOVE as an en passant capture!! gamefile looks for this tag
	// on the individual move to detect en passant captures and know when to perform them.
	enPassantSquare.enpassant = true;
	appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, enPassantSquare, color);
}

/**
 * Appends the provided move to the running individual moves list,
 * and adds the `promoteTrigger` special flag to it if it landed on a promotion rank.
 */
function appendPawnMoveAndAttachPromoteFlag(gamefile, individualMoves, landCoords, color) {
	if (gamefile.gameRules.promotionRanks !== undefined) {
		const teamPromotionRanks = gamefile.gameRules.promotionRanks[color];
		if (teamPromotionRanks.includes(landCoords[1])) landCoords.promoteTrigger = true;
	}

	individualMoves.push(landCoords);
}

/**
 * Appends legal moves for the rose piece to the provided legal individual moves list.
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - Coordinates of the rose selected
 * @param {string} color - The color of the rose selected
 * @returns {CoordsSpecial[]}
 */
function roses(gamefile, coords, color) {
	const movements = [[-2, -1], [-1, -2], [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1]]; // Counter-clockwise
	const directions = [1, -1]; // Counter-clockwise and clockwise directions
	/** @type {CoordsSpecial[]} */
	const individualMoves = [];

	for (let i = 0; i < movements.length; i++) {
		for (const direction of directions) {
			/** @type {CoordsSpecial} */
			let currentCoord = coordutil.copyCoords(coords);
			let b = i;
			const path = [coords]; // The running path of travel for the current spiral. Used for animating.
			for (let c = 0; c < movements.length - 1; c++) { // Iterate 7 times, since we can't land on the square we started
				const movement = movements[math.posMod(b, movements.length)];
				currentCoord = coordutil.addCoordinates(currentCoord, movement);
				path.push(coordutil.copyCoords(currentCoord));
				const pieceOnSquare = gamefileutility.getPieceAtCoords(gamefile, currentCoord); // { type, index, coords }
				if (pieceOnSquare) {
					const colorOfPiece = colorutil.getPieceColorFromType(pieceOnSquare.type);
					// eslint-disable-next-line max-depth
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
	 * Appends a coordinate to the individual moves list if it's not already present.
	 * If it is present, it chooses the one according to this priority:
	 * 1. Shortest path
	 * 2. Path that curves towards the center of play
	 * 3. Randomly pick one
	 * @param {Coords} newCoord - The coordinate to append [x, y].
	 */
	function appendCoordToIndividuals(newCoord, path) {
		newCoord.path = jsutil.deepCopyObject(path);
		for (let i = 0; i < individualMoves.length; i++) {
			const coord = individualMoves[i];
			if (!coordutil.areCoordsEqual(coord, newCoord)) continue;
			/*
			 * This coord has already been added to our individual moves!!!
			 * Pick the one with the shortest path.
			 */
			if (coord.path.length < newCoord.path.length) individualMoves[i] = coord; // First path shorter
			else if (coord.path.length > newCoord.path.length) individualMoves[i] = newCoord; // Second path shorter
			else if (coord.path.length === newCoord.path.length) { // Path are equal length
				// Pick the one that curves towards the center of play,
				// as that's more likely to stay within the window during animation.
				const centerOfPlay = math.calcCenterOfBoundingBox(gamefile.startSnapshot.box);
				const vectorToCenter = math.calculateVectorFromPoints(coords, centerOfPlay);
				const existingCoordVector = math.calculateVectorFromPoints(coords, coord.path[1]);
				const newCoordVector = math.calculateVectorFromPoints(coords, newCoord.path[1]);
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
 * @param {gamefile} gamefile - The gamefile
 * @param {number[]} coords - The coordinates of the piece
 * @returns {boolean} *true* if it has it's special move rights.
 */
function doesPieceHaveSpecialRight(gamefile, coords) {
	const key = coordutil.getKeyFromCoords(coords);
	return gamefile.specialRights[key];
}

// Returns true if the type is a pawn and the coords it moved to is a promotion line

/**
 * Returns true if a pawn moved onto a promotion line.
 * @param {string} type 
 * @param {number[]} coordsClicked 
 * @returns {boolean}
 */
function isPawnPromotion(gamefile, type, coordsClicked) {
	if (!type.startsWith('pawns')) return false;
	if (!gamefile.gameRules.promotionRanks) return false; // This game doesn't have promotion.

	const color = colorutil.getPieceColorFromType(type);
	const promotionRanks = gamefile.gameRules.promotionRanks[color];

	return promotionRanks.includes(coordsClicked[1]);
}

/**
 * Transfers any special move flags from the provided coordinates to the move.
 * @param {number[]} coords - The coordinates
 * @param {MoveDraft} move - The move
 */
function transferSpecialFlags_FromCoordsToMove(coords, move) {
	for (const special of allSpecials) {
		if (coords[special]) {
			move[special] = jsutil.deepCopyObject(coords[special]);
		}
	}
}

/**
 * Transfers any special move flags from the provided move to the coordinates.
 * @param {number[]} coords - The coordinates
 * @param {MoveDraft} move - The move
 */
function transferSpecialFlags_FromMoveToCoords(move, coords) {
	for (const special of allSpecials) {
		if (move[special]) coords[special] = jsutil.deepCopyObject(move[special]);
	}
}

/**
 * Transfers any special move flags from the one pair of coordinates to another.
 * @param {number[]} srcCoords - The source coordinates
 * @param {number[]} destCoords - The destination coordinates
 */
function transferSpecialFlags_FromCoordsToCoords(srcCoords, destCoords) {
	for (const special of allSpecials) {
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